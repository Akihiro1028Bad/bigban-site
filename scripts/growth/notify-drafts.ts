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

import { fetchDraftKey } from "./draft-meta";
import {
  buildDraftNotifyMessage,
  buildPreviewUrl,
  type DraftNotifyItem,
} from "./draft-notify";
import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";

const ENDPOINT = "news";

interface InputItem {
  title: string;
  contentId: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function parseItems(raw: unknown): InputItem[] {
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
    return { title: item.title, contentId: item.contentId };
  });
}

/** 1記事分のプレビューURLを解決する。draftKey が取れなければ null。 */
async function resolvePreviewUrl(
  item: InputItem,
  ctx: { serviceDomain: string; apiKey: string; siteUrl: string; secret: string }
): Promise<string | null> {
  try {
    const draftKey = await fetchDraftKey(ENDPOINT, item.contentId, {
      serviceDomain: ctx.serviceDomain,
      apiKey: ctx.apiKey,
      fetchFn: defaultFetch,
    });
    if (!draftKey) return null;
    return buildPreviewUrl({
      siteUrl: ctx.siteUrl,
      secret: ctx.secret,
      contentId: item.contentId,
      draftKey,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `${item.contentId} の draftKey 取得に失敗(URLなしで通知): ${message}\n`
    );
    return null;
  }
}

async function main(): Promise<void> {
  const payloadPath = process.argv[2];
  if (!payloadPath) throw new Error("使い方: notify-drafts -- <payload.json>");

  const raw = JSON.parse(await readFile(payloadPath, "utf-8")) as unknown;
  const inputs = parseItems(raw);

  const ctx = {
    serviceDomain: requireEnv("MICROCMS_SERVICE_DOMAIN"),
    apiKey:
      process.env.MICROCMS_MANAGEMENT_API_KEY ??
      requireEnv("MICROCMS_CONTENT_API_KEY"),
    siteUrl: requireEnv("NEXT_PUBLIC_SITE_URL"),
    secret: requireEnv("MICROCMS_DRAFT_SECRET"),
  };

  const items: DraftNotifyItem[] = [];
  for (const input of inputs) {
    const previewUrl = await resolvePreviewUrl(input, ctx);
    items.push({ title: input.title, contentId: input.contentId, previewUrl });
  }

  const message = buildDraftNotifyMessage(items);

  if (process.env.GROWTH_DRYRUN) {
    process.stdout.write(`${message}\n`);
    return;
  }

  await pushTextMessage(requireEnv("LINE_GROUP_ID"), message, {
    channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    fetchFn: defaultFetch,
  });
  process.stderr.write("LINE グループへ下書き完了を通知しました。\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`下書き通知に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
