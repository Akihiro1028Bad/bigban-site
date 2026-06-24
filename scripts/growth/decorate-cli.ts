/**
 * 記事装飾アシスタント(Epic #147)の決定的オペレーション CLI(headless poller 用)。
 *
 *   npm run growth:decorate -- reap                          # 処理中のstale(>15分)を失敗に回収＋通知
 *   npm run growth:decorate -- next                          # 依頼中を1件ロック(処理中)し JSON を標準出力
 *   npm run growth:decorate -- present <pageId> <jsonファイル> # 提案JSONを検証→提示中＋通知
 *   npm run growth:decorate -- fail <pageId> <reason>        # 失敗にして理由＋通知
 *
 * claude(decorate.md)は「本文をトップレベル要素に分割し、各箇所の装飾提案(op/decoration/理由)を作る」
 * 創作部分だけを担い、Notion 書き込み・通知・ロック・回収はこの CLI が決定的に行う。提案は**メタ情報だけ**
 * (生 HTML は出さない)。反映(採用)は承認画面が applyDecoration＋既存 draft/edit で行う。Notion＋LINE のみ。
 * 純ロジックは decorate.ts でテスト済み。薄い配線のためカバレッジ対象外。
 * GROWTH_DRYRUN=1 では書き込み/送信せず内容を表示する。
 */

import "dotenv/config";
import { readFileSync } from "node:fs";

import {
  DECORATE_PROPS,
  DECORATE_TIMEOUT_MS,
  buildDecorateFailMessage,
  buildDecorateFailProps,
  buildDecoratePresentMessage,
  buildDecoratePresentFlex,
  buildDecoratePresentProps,
  buildDecorateProcessingProps,
  decorateRowFromPage,
  DecorationProposalsSchema,
  selectStaleDecorateIds,
  serializeProposals,
  type DecorateRow,
} from "./decorate";
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
  return { property: DECORATE_PROPS.status, select: { equals: value } };
}

async function rowsByStatus(value: string, options: NotionApiOptions): Promise<DecorateRow[]> {
  const { pages } = await queryDataSource(
    IDEA_DS,
    { filter: statusFilter(value), pageSize: 100 },
    options
  );
  return pages.map(decorateRowFromPage);
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

/** reaper: 処理中のまま放置された行を失敗へ回収し通知する。 */
async function reap(options: NotionApiOptions): Promise<void> {
  const rows = await rowsByStatus("処理中", options);
  const staleIds = new Set(selectStaleDecorateIds(rows, Date.now(), DECORATE_TIMEOUT_MS));
  for (const row of rows) {
    if (!staleIds.has(row.id)) continue;
    await write(row.id, buildDecorateFailProps(REAP_REASON), options);
    await notify(buildDecorateFailMessage(row.title, REAP_REASON));
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
    await write(row.id, buildDecorateFailProps("下書き本文がまだありません。"), options);
    await notify(buildDecorateFailMessage(row.title, "下書き本文がまだありません。"));
    process.stdout.write("{}\n");
    return;
  }
  await write(row.id, buildDecorateProcessingProps(), options);
  process.stdout.write(
    `${JSON.stringify({
      pageId: row.id,
      title: row.title,
      instruction: row.instruction,
      bodyHtml: row.bodyHtml,
    })}\n`
  );
}

/** claude が書いた提案JSONファイルを検証し、提示中にして通知する。 */
async function present(pageId: string, jsonPath: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const raw = readFileSync(jsonPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("提案JSONを解釈できませんでした。");
  }
  const result = DecorationProposalsSchema.safeParse(parsed);
  if (!result.success) throw new Error("提案JSONがスキーマ検証に失敗しました。");
  const proposalsJson = serializeProposals(result.data);
  const title = decorateRowFromPage(await getPage(pageId, options)).title;
  await write(pageId, buildDecoratePresentProps(proposalsJson), options);
  await notifyFlex(
    buildDecoratePresentMessage(title, approveUrl()),
    buildDecoratePresentFlex(title, approveUrl())
  );
}

async function fail(pageId: string, reason: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const title = decorateRowFromPage(await getPage(pageId, options)).title;
  await write(pageId, buildDecorateFailProps(reason), options);
  await notify(buildDecorateFailMessage(title, reason));
}

async function main(): Promise<void> {
  const [command, a, b] = process.argv.slice(2);
  const options = notionOptions();
  switch (command) {
    case "reap":
      return reap(options);
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
      throw new Error("使い方: decorate-cli <reap|next|present|fail> ...");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`decorate-cli に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
