/**
 * 下書き作成完了を LINE グループへ通知する実行入口(headless 対応)。
 *
 *   npm run growth:notify-drafts -- <payload.json>
 *
 * payload.json は作成済み下書きの配列、または { items: [...] }。
 *   [{ "title": "記事タイトル", "contentId": "xxxx" }, ...]
 * 各 contentId について管理APIで draftKey を引き、プレビューURLを組み立てて通知する。
 * draftKey が取れない記事は URL なし(下書きID)でフォールバックし、通知自体は必ず送る。
 * GROWTH_DRYRUN=1 なら送信せず本文を標準出力に表示する。
 * 薄い配線のためテスト対象外(ロジックは draft-notify / draft-meta でテスト済み)。
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { fetchContentSummary, fetchDraftKey, type ContentSummary } from "./draft-meta";
import {
  buildDraftFlex,
  buildDraftNotifyMessage,
  previewUrlOrNull,
  type DraftFlexItem,
  type DraftNotifyItem,
} from "./draft-notify";
import { growthEndpoint, growthMediaForRow } from "./endpoint";
import { defaultFetch } from "./http";
import { pushFlexMessage, pushTextMessage } from "./line";

type EndpointEnv = Readonly<Record<string, string | undefined>>;

export interface InputItem {
  title: string;
  contentId: string;
  media?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

export function parseItems(raw: unknown): InputItem[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : null;
  if (!list) {
    throw new Error("payload は配列または { items: [...] } 形式にしてください。");
  }
  return list.map((entry) => {
    const item = entry as Partial<InputItem>;
    if (!item.title || !item.contentId) {
      throw new Error("各要素には title と contentId が必要です。");
    }
    return {
      title: item.title,
      contentId: item.contentId,
      ...(typeof item.media === "string" ? { media: item.media } : {}),
    };
  });
}

export function endpointForNotifyItem(
  item: InputItem,
  env: EndpointEnv = process.env
): string {
  return growthEndpoint(growthMediaForRow(item.media), env);
}

interface PreviewCtx {
  serviceDomain: string | null;
  /** draftKey 取得(管理API)用キー。 */
  managementApiKey: string | null;
  /** 要約取得(コンテンツAPI)用キー。 */
  contentApiKey: string | null;
  siteUrl: string | null;
}

/** draftKey を取得する。設定欠落・障害時は例外を投げず null(通知は必ず送る=#20)。 */
async function resolveDraftKey(item: InputItem, ctx: PreviewCtx): Promise<string | null> {
  if (!ctx.serviceDomain || !ctx.managementApiKey) return null;
  const endpoint = endpointForNotifyItem(item);
  try {
    return await fetchDraftKey(endpoint, item.contentId, {
      serviceDomain: ctx.serviceDomain,
      apiKey: ctx.managementApiKey,
      fetchFn: defaultFetch,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `${endpoint}/${item.contentId} の draftKey 取得に失敗(URLなしで通知): ${message}\n`
    );
    return null;
  }
}

/** 表示用の要約(title/excerpt/category/eyecatch)を取得する。障害時は null(沈黙させない)。 */
async function resolveSummary(
  item: InputItem,
  draftKey: string | null,
  ctx: PreviewCtx
): Promise<ContentSummary | null> {
  if (!ctx.serviceDomain || !ctx.contentApiKey) return null;
  const endpoint = endpointForNotifyItem(item);
  try {
    return await fetchContentSummary(endpoint, item.contentId, draftKey, {
      serviceDomain: ctx.serviceDomain,
      apiKey: ctx.contentApiKey,
      fetchFn: defaultFetch,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `${endpoint}/${item.contentId} の要約取得に失敗(簡易表示で通知): ${message}\n`
    );
    return null;
  }
}

async function main(): Promise<void> {
  const payloadPath = process.argv[2];
  if (!payloadPath) throw new Error("使い方: notify-drafts -- <payload.json>");

  const raw = JSON.parse(await readFile(payloadPath, "utf-8")) as unknown;
  const inputs = parseItems(raw);

  // 承認画面リンク/要約用の設定はすべて任意。欠けていても通知は止めずフォールバックする(#20)。
  // 通知リンクは承認画面(?draft=<contentId>)へ飛ぶため siteUrl のみで組み立てる
  // (secret/draftKey は URL 用途には不要。draftKey は下の要約取得でのみ使う)。
  const ctx: PreviewCtx = {
    serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN ?? null,
    // 読み取り・コンテンツ・管理APIで同じサーバー専用キーを使う。
    managementApiKey: process.env.MICROCMS_API_KEY ?? null,
    contentApiKey: process.env.MICROCMS_API_KEY ?? null,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  };

  const flexItems: DraftFlexItem[] = [];
  const notifyItems: DraftNotifyItem[] = [];
  for (const input of inputs) {
    // draftKey は承認画面リンクには不要。表示用の要約(fetchContentSummary)取得にのみ使う。
    const draftKey = await resolveDraftKey(input, ctx);
    const previewUrl = previewUrlOrNull({
      siteUrl: ctx.siteUrl,
      contentId: input.contentId,
    });
    const summary = await resolveSummary(input, draftKey, ctx);
    const title = summary?.title ?? input.title;
    flexItems.push({
      title,
      excerpt: summary?.excerpt ?? "",
      category: summary?.category ?? "",
      eyecatchUrl: summary?.eyecatchUrl ?? null,
      previewUrl,
      contentId: input.contentId,
    });
    notifyItems.push({ title, contentId: input.contentId, previewUrl });
  }

  // altText は Flex 非対応環境のフォールバック。0件はテキストのみ送る(空カルーセルは送れない)。
  const altText = buildDraftNotifyMessage(notifyItems);
  const lineOptions = {
    channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    fetchFn: defaultFetch,
  };

  if (flexItems.length === 0) {
    if (process.env.GROWTH_DRYRUN) {
      process.stdout.write(`${altText}\n`);
      return;
    }
    await pushTextMessage(requireEnv("LINE_GROUP_ID"), altText, lineOptions);
    process.stderr.write("LINE グループへ下書き完了を通知しました。\n");
    return;
  }

  const carousel = buildDraftFlex(flexItems);

  if (process.env.GROWTH_DRYRUN) {
    process.stdout.write(`${altText}\n\n[Flex]\n${JSON.stringify(carousel, null, 2)}\n`);
    return;
  }

  await pushFlexMessage(requireEnv("LINE_GROUP_ID"), altText, carousel, lineOptions);
  process.stderr.write("LINE グループへ下書き完了を通知しました(Flex)。\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`下書き通知に失敗しました: ${message}\n`);
    process.exitCode = 1;
  });
}
