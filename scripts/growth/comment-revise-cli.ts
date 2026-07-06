/**
 * 本文インラインコメント→AI修正(#182 Phase 2)の決定的オペレーション CLI(headless poller 用)。
 *
 *   npm run growth:comment-revise -- reap                          # 処理中のstale(>15分)を失敗に回収＋通知
 *   npm run growth:comment-revise -- next                          # 依頼中を1件ロック(処理中)し JSON を標準出力
 *   npm run growth:comment-revise -- present <pageId> <jsonファイル> # before/after案を検証→提示中＋通知
 *   npm run growth:comment-revise -- fail <pageId> <reason>        # 失敗にして理由＋通知
 *
 * claude(comment-revise.md)は「コメントされた文を含むブロックだけを style-guide に沿って書き換え、
 * before/after 案を作る」創作部分だけを担う。Notion 書き込み・通知・ロック・回収はこの CLI が
 * 決定的に行う。**本文・下書き・microCMS には書き込まない**(反映は人が承認画面で行う)。純ロジックは
 * bodyComment.ts でテスト済み。薄い配線のためカバレッジ対象外。GROWTH_DRYRUN=1 で書き込み/送信せず表示。
 */

import "dotenv/config";
import { readFileSync } from "node:fs";

import {
  BODY_COMMENT_PROPS,
  BODY_COMMENT_TIMEOUT_MS,
  bodyCommentRowFromPage,
  buildBodyCommentFailProps,
  buildBodyCommentPresentProps,
  buildBodyCommentProcessingProps,
  parseBodyCommentRequest,
  parseBodyCommentProposal,
  selectStaleBodyCommentIds,
  serializeBodyCommentProposal,
} from "./bodyComment";
import { defaultFetch } from "./http";
import { pushFlexMessage, pushTextMessage } from "./line";
import { buildNoticeFlex } from "./notice-flex";
import { getPage, queryDataSource, updatePageProps } from "./notion";
import type { BodyComment, BodyCommentRow } from "./bodyComment";
import type { FlexContainer } from "./digest-flex";
import type { NotionApiOptions, NotionPage } from "./notion";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const REAP_REASON = "コメント反映が15分以上完了しませんでした(PC再起動等の可能性)。もう一度依頼できます。";
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

async function rowsByStatus(value: string, options: NotionApiOptions): Promise<BodyCommentRow[]> {
  const { pages } = await queryDataSource(
    IDEA_DS,
    { filter: { property: BODY_COMMENT_PROPS.status, select: { equals: value } }, pageSize: 100 },
    options
  );
  return pages.map(bodyCommentRowFromPage);
}

function titleText(page: NotionPage): string {
  const value = page.properties["タイトル案"] as
    | { title?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

async function titleOf(pageId: string, options: NotionApiOptions): Promise<string> {
  return titleText(await getPage(pageId, options));
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

async function write(
  pageId: string,
  props: Record<string, unknown>,
  options: NotionApiOptions
): Promise<void> {
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
  const staleIds = new Set(selectStaleBodyCommentIds(rows, Date.now(), BODY_COMMENT_TIMEOUT_MS));
  for (const row of rows) {
    if (!staleIds.has(row.id)) continue;
    await write(row.id, buildBodyCommentFailProps(REAP_REASON), options);
    await notify(`本文コメントの修正に失敗しました(${REAP_REASON})。`);
    process.stderr.write(`reaped(失敗化): ${row.id}\n`);
  }
}

/** 依頼中を1件ロック(処理中)し、claude が書き換える JSON を標準出力する。無ければ空。 */
async function next(options: NotionApiOptions): Promise<void> {
  const rows = await rowsByStatus("依頼中", options);
  const row = rows[0];
  if (!row) {
    process.stdout.write("{}\n");
    return;
  }
  if (!row.bodyHtml || !row.request) {
    await write(row.id, buildBodyCommentFailProps("下書き本文またはコメントが見つかりません。"), options);
    await notify("本文コメントの修正に失敗しました(下書き本文またはコメントが見つかりません)。");
    process.stdout.write("{}\n");
    return;
  }
  await write(row.id, buildBodyCommentProcessingProps(), options);
  const parsed = parseBodyCommentRequest(row.request);
  const payload: { pageId: string; comments: BodyComment[]; overall?: string; bodyHtml: string } = {
    pageId: row.id,
    comments: parsed.comments,
    bodyHtml: row.bodyHtml,
  };
  if (parsed.overall) payload.overall = parsed.overall;
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/** claude が書いた before/after 案ファイルを検証し、提示中にして通知する。 */
async function present(pageId: string, jsonPath: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const items = parseBodyCommentProposal(readFileSync(jsonPath, "utf-8"));
  if (items.length === 0) throw new Error("反映案 JSON が不正です(スキーマ検証に失敗 or 空)。");
  const proposalJson = serializeBodyCommentProposal(items);
  const title = await titleOf(pageId, options);
  await write(pageId, buildBodyCommentPresentProps(proposalJson), options);
  const alt = [
    "本文コメントへの修正案ができました。",
    `タイトル: ${title}`,
    "承認画面で元 vs 新の差分を確認し、反映してください。",
    approveUrl(),
  ].join("\n");
  await notifyFlex(
    alt,
    buildNoticeFlex({
      heading: "💬 コメントへの修正案ができました",
      title,
      lines: ["承認画面で元 vs 新の差分を確認し、反映してください。"],
      approveUrl: approveUrl(),
    })
  );
}

async function fail(pageId: string, reason: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const title = await titleOf(pageId, options);
  await write(pageId, buildBodyCommentFailProps(reason), options);
  await notify(`本文コメントの修正に失敗しました。\nタイトル: ${title}\n理由: ${reason}`);
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
      return fail(a, b.slice(0, 200), options);
    default:
      throw new Error("使い方: comment-revise-cli <reap|next|present|fail> ...");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`comment-revise-cli に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
