/**
 * 記事スタイリング・アドバイザー(Epic #146)の決定的オペレーション CLI(headless poller 用)。
 *
 *   npm run growth:advise -- reap                          # 処理中のstale(>15分)を失敗に回収＋通知
 *   npm run growth:advise -- peek                          # 依頼中の件数を読み取り専用で出力
 *   npm run growth:advise -- next                          # 依頼中を1件ロック(処理中)し JSON を標準出力
 *   npm run growth:advise -- present <pageId> <jsonファイル> # アドバイスJSONを検証→提示中＋通知
 *   npm run growth:advise -- fail <pageId> <reason>        # 失敗にして理由＋通知
 *
 * claude(advise.md)は「本文＋タイトルを style-guide に照らして分析し、アドバイスJSONを作る」
 * 創作部分だけを担い、Notion 書き込み・通知・ロック・回収はこの CLI が決定的に行う。**read-only**
 * (本文・下書きには一切書き込まない・microCMS も触らない)。純ロジックは advise.ts でテスト済み。
 * 薄い配線のためカバレッジ対象外。GROWTH_DRYRUN=1 では書き込み/送信せず内容を表示する。
 */

import "dotenv/config";
import { readFileSync } from "node:fs";

import {
  adviceRowFromPage,
  ADVISE_PROPS,
  ADVISE_TIMEOUT_MS,
  buildAdviceFailMessage,
  buildAdviceFailProps,
  buildAdvicePresentMessage,
  buildAdvicePresentFlex,
  buildAdvicePresentProps,
  buildAdviceProcessingProps,
  parseAdvice,
  selectStaleAdviceIds,
  serializeAdvice,
  type AdviceRow,
} from "./advise";
import type { FlexContainer } from "./digest-flex";
import { defaultFetch } from "./http";
import { pushFlexMessage, pushTextMessage } from "./line";
import {
  getPage,
  queryDataSource,
  updatePageProps,
  type NotionApiOptions,
} from "./notion";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const REAP_REASON = "分析が15分以上完了しませんでした(PC再起動等の可能性)。もう一度依頼できます。";
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);
const PAGE_ID_RE = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

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

function approveUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return `${base}/growth/approve`;
}

function statusFilter(value: string): unknown {
  return { property: ADVISE_PROPS.status, select: { equals: value } };
}

async function rowsByStatus(value: string, options: NotionApiOptions): Promise<AdviceRow[]> {
  const { pages } = await queryDataSource(
    IDEA_DS,
    { filter: statusFilter(value), pageSize: 100 },
    options
  );
  return pages.map(adviceRowFromPage);
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

/** 提示通知を Flex で送る(#162)。altText は Flex 非対応環境のフォールバック。 */
async function notifyFlex(altText: string, contents: FlexContainer): Promise<void> {
  if (DRYRUN) {
    process.stdout.write(`[dry-run] LINE(flex):\n${altText}\n`);
    return;
  }
  await pushFlexMessage(requireEnv("LINE_GROUP_ID"), altText, contents, {
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

/** reaper: 処理中・依頼中のまま放置された行(PC停止等)を失敗へ回収し通知する(C2 止血)。 */
async function reap(options: NotionApiOptions): Promise<void> {
  const rows = [
    ...(await rowsByStatus("処理中", options)),
    ...(await rowsByStatus("依頼中", options)),
  ];
  const staleIds = new Set(selectStaleAdviceIds(rows, Date.now(), ADVISE_TIMEOUT_MS));
  for (const row of rows) {
    if (!staleIds.has(row.id)) continue;
    await write(row.id, buildAdviceFailProps(REAP_REASON), options);
    await notify(buildAdviceFailMessage(row.title, REAP_REASON));
    process.stderr.write(`reaped(失敗化): ${row.id}\n`);
  }
}

/** 依頼中を1件ロック(処理中)し、claude が分析する JSON を標準出力する。無ければ空。 */
async function next(options: NotionApiOptions): Promise<void> {
  const rows = await rowsByStatus("依頼中", options);
  const row = rows[0];
  if (!row) {
    process.stdout.write("{}\n");
    return;
  }
  if (!row.contentId || !row.bodyHtml) {
    // 下書き/本文ミラー未作成。分析対象が無いので失敗にして通知(沈黙させない)。
    await write(row.id, buildAdviceFailProps("下書き本文がまだありません。"), options);
    await notify(buildAdviceFailMessage(row.title, "下書き本文がまだありません。"));
    process.stdout.write("{}\n");
    return;
  }
  await write(row.id, buildAdviceProcessingProps(), options);
  process.stdout.write(
    `${JSON.stringify({
      pageId: row.id,
      title: row.title,
      instruction: row.instruction,
      bodyHtml: row.bodyHtml,
    })}\n`
  );
}

/** next が拾う候補(依頼中)を読み取り専用で数える。claim/通知はしない。 */
async function peek(options: NotionApiOptions): Promise<void> {
  const rows = await rowsByStatus("依頼中", options);
  process.stdout.write(`${rows.length}\n`);
}

/** claude が書いたアドバイスJSONファイルを検証し、提示中にして通知する。 */
async function present(pageId: string, jsonPath: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const raw = readFileSync(jsonPath, "utf-8");
  const advice = parseAdvice(raw);
  if (!advice) throw new Error("アドバイスJSONが不正です(スキーマ検証に失敗)。");
  const adviceJson = serializeAdvice(advice);
  const title = adviceRowFromPage(await getPage(pageId, options)).title;
  await write(pageId, buildAdvicePresentProps(adviceJson), options);
  await notifyFlex(
    buildAdvicePresentMessage(title, approveUrl()),
    buildAdvicePresentFlex(title, approveUrl())
  );
}

async function fail(pageId: string, reason: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const title = adviceRowFromPage(await getPage(pageId, options)).title;
  await write(pageId, buildAdviceFailProps(reason), options);
  await notify(buildAdviceFailMessage(title, reason));
}

async function main(): Promise<void> {
  const [command, a, b] = process.argv.slice(2);
  const options = notionOptions();
  switch (command) {
    case "reap":
      return reap(options);
    case "peek":
      return peek(options);
    case "next":
      return next(options);
    case "present":
      if (!a || !b) throw new Error("使い方: present <pageId> <jsonファイル>");
      return present(a, b, options);
    case "fail":
      if (!a || !b) throw new Error("使い方: fail <pageId> <reason>");
      // 異常に長い通知本文を防ぐ(security M-3)。
      return fail(a, b.slice(0, 200), options);
    default:
      throw new Error("使い方: advise-cli <reap|peek|next|present|fail> ...");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`advise-cli に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
