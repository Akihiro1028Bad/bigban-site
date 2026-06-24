/**
 * アイキャッチ AI 再生成ループ(Epic #140 / #144)の決定的オペレーション CLI(headless poller 用)。
 *
 *   npm run growth:eyecatch-regen -- reap                    # 処理中のstale(>15分)を失敗に回収＋通知
 *   npm run growth:eyecatch-regen -- next                    # 依頼中を1件ロック(処理中)し JSON を標準出力
 *   npm run growth:eyecatch-regen -- done <pageId> <url>     # 生成画像URLで下書きを差し替え＋完了＋通知
 *   npm run growth:eyecatch-regen -- fail <pageId> <reason>  # 失敗にして理由＋通知
 *
 * claude(regen-eyecatch.md)は「指示→英語の行為に翻案して gen-eyecatch / upload-media を回す」
 * 創作部分だけを担い、Notion 書き込み・patchDraft・通知・ロック・回収はこの CLI が決定的に行う。
 * 純ロジックは eyecatch-regen.ts でテスト済み。薄い配線のためカバレッジ対象外。
 * GROWTH_DRYRUN=1 では書き込み/送信せず内容を表示する。
 */

import "dotenv/config";

import { patchDraft } from "./content";
import {
  buildRegenDoneProps,
  buildRegenFailProps,
  buildRegenProcessingProps,
  buildRegenDoneMessage,
  buildRegenFailMessage,
  REGEN_PROPS,
  REGEN_TIMEOUT_MS,
  regenRowFromPage,
  selectStaleRegenIds,
  type RegenRow,
} from "./eyecatch-regen";
import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import {
  buildEyecatchMirrorProps,
  getPage,
  queryDataSource,
  updatePageProps,
  type NotionApiOptions,
} from "./notion";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const ENDPOINT = "news";
const REAP_REASON = "処理が15分以上完了しませんでした(PC再起動等の可能性)。もう一度再生成を依頼できます。";
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);
const PAGE_ID_RE = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
// 差し替えに使えるのは microCMS のアセット URL のみ(任意 URL 書き込み防止)。
const ASSET_URL_RE = /^https:\/\/images\.microcms-assets\.io\//;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function assertPageId(id: string): string {
  if (!PAGE_ID_RE.test(id)) throw new Error(`不正な pageId: ${id}`);
  return id;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

function contentOptions(): { serviceDomain: string; apiKey: string; fetchFn: typeof defaultFetch } {
  return {
    serviceDomain: requireEnv("MICROCMS_SERVICE_DOMAIN"),
    // 書き込みは content API キー(管理キーは使わない)。未設定なら管理キーで代替。
    apiKey: process.env.MICROCMS_CONTENT_API_KEY ?? requireEnv("MICROCMS_MANAGEMENT_API_KEY"),
    fetchFn: defaultFetch,
  };
}

function approveUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return `${base}/growth/approve`;
}

function statusFilter(value: string): unknown {
  return { property: REGEN_PROPS.status, select: { equals: value } };
}

async function rowsByStatus(value: string, options: NotionApiOptions): Promise<RegenRow[]> {
  const { pages } = await queryDataSource(
    IDEA_DS,
    { filter: statusFilter(value), pageSize: 100 },
    options
  );
  return pages.map(regenRowFromPage);
}

async function notify(text: string): Promise<void> {
  if (DRYRUN) {
    process.stdout.write(`[dry-run] LINE:\n${text}\n`);
    return;
  }
  await pushTextMessage(requireEnv("LINE_GROUP_ID"), text, {
    channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
    fetchFn: defaultFetch,
  });
}

async function write(pageId: string, props: Record<string, unknown>, options: NotionApiOptions): Promise<void> {
  if (DRYRUN) {
    process.stdout.write(`[dry-run] PATCH ${pageId}: ${JSON.stringify(props)}\n`);
    return;
  }
  await updatePageProps(pageId, props, options);
}

/** reaper: 処理中のまま放置された行を失敗へ回収し通知する。 */
async function reap(options: NotionApiOptions): Promise<void> {
  const rows = await rowsByStatus("処理中", options);
  const staleIds = new Set(selectStaleRegenIds(rows, Date.now(), REGEN_TIMEOUT_MS));
  for (const row of rows) {
    if (!staleIds.has(row.id)) continue;
    await write(row.id, buildRegenFailProps(), options);
    await notify(buildRegenFailMessage(row.title, REAP_REASON));
    process.stderr.write(`reaped(失敗化): ${row.id}\n`);
  }
}

/** 依頼中を1件ロック(処理中)し、claude が処理する JSON を標準出力する。無ければ空。 */
async function next(options: NotionApiOptions): Promise<void> {
  const rows = await rowsByStatus("依頼中", options);
  const row = rows[0];
  if (!row) {
    process.stdout.write("{}\n");
    return;
  }
  if (!row.contentId) {
    // 下書き未作成。生成しても差し替え先が無いので失敗にして通知する(沈黙させない)。
    await write(row.id, buildRegenFailProps(), options);
    await notify(buildRegenFailMessage(row.title, "下書きが未作成のため再生成できません。"));
    process.stdout.write("{}\n");
    return;
  }
  await write(row.id, buildRegenProcessingProps(), options);
  process.stdout.write(
    `${JSON.stringify({
      pageId: row.id,
      title: row.title,
      instruction: row.instruction,
      contentId: row.contentId,
    })}\n`
  );
}

/** 生成済み画像 URL で下書きのアイキャッチを差し替え、完了にして通知する。 */
async function done(pageId: string, eyecatchUrl: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  if (!ASSET_URL_RE.test(eyecatchUrl)) {
    throw new Error(`eyecatchUrl は microCMS アセットURLにしてください: ${eyecatchUrl}`);
  }
  const row = regenRowFromPage(await getPage(pageId, options));
  if (!row.contentId) throw new Error("下書きID(contentId)がありません。");
  if (DRYRUN) {
    process.stdout.write(`[dry-run] patchDraft ${row.contentId} eyecatch=${eyecatchUrl}\n`);
  } else {
    await patchDraft(ENDPOINT, row.contentId, { eyecatch: eyecatchUrl }, contentOptions());
  }
  await write(
    pageId,
    { ...buildEyecatchMirrorProps(eyecatchUrl), ...buildRegenDoneProps() },
    options
  );
  await notify(buildRegenDoneMessage(row.title, approveUrl()));
}

async function fail(pageId: string, reason: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const title = regenRowFromPage(await getPage(pageId, options)).title;
  await write(pageId, buildRegenFailProps(), options);
  await notify(buildRegenFailMessage(title, reason));
}

async function main(): Promise<void> {
  const [command, a, b] = process.argv.slice(2);
  const options = notionOptions();
  switch (command) {
    case "reap":
      return reap(options);
    case "next":
      return next(options);
    case "done":
      if (!a || !b) throw new Error("使い方: done <pageId> <eyecatchUrl>");
      return done(a, b, options);
    case "fail":
      if (!a || !b) throw new Error("使い方: fail <pageId> <reason>");
      return fail(a, b, options);
    default:
      throw new Error("使い方: eyecatch-regen-cli <reap|next|done|fail> ...");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`eyecatch-regen-cli に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
