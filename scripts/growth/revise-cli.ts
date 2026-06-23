/**
 * 構成案修正ループ(Epic #40 / #44)の決定的オペレーション CLI(headless poller 用)。
 *
 *   npm run growth:revise -- reap                       # 処理中のstale(>15分)を失敗に回収＋通知
 *   npm run growth:revise -- next                       # 依頼中を1件ロック(処理中)し JSON を標準出力
 *   npm run growth:revise -- present <pageId> <file>    # 修正案を書き込み提示中＋通知
 *   npm run growth:revise -- fail <pageId> <reason>     # 失敗にして理由＋通知
 *
 * claude(revise-outline.md)は「テキストの修正」だけを担い、Notion 書き込み・通知・
 * reaper・ロックはこの CLI が決定的に行う(stdout 不信・純ロジックは revise.ts でテスト済み)。
 * GROWTH_DRYRUN=1 では書き込み/送信せず内容を表示する。
 * 薄い配線のためカバレッジ対象外(ロジックは revise.ts でテスト済み)。
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { FlexContainer } from "./digest-flex";
import { defaultFetch } from "./http";
import { pushFlexMessage } from "./line";
import {
  getPage,
  queryDataSource,
  updatePageProps,
  type NotionApiOptions,
} from "./notion";
import {
  buildReviseFailMessage,
  buildReviseFailProps,
  buildReviseProcessingProps,
  buildReviseProposalProps,
  buildRevisePresentMessage,
  REVISE_PROPS,
  REVISE_TIMEOUT_MS,
  reviseRowFromPage,
  selectStaleReviseIds,
  type ReviseRow,
} from "./revise";
import {
  buildReviseFailFlex,
  buildRevisePresentFlex,
  excerptLines,
} from "./revise-flex";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const REAP_REASON = "処理が15分以上完了しませんでした(PC再起動等の可能性)。やり直しで再依頼できます。";
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);
const PAGE_ID_RE = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
// 修正案ステージの許可ディレクトリ(claude 由来パスのトラバーサル防御)。
const STAGE_DIR = path.resolve(process.cwd(), ".growth-tmp");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

/** claude 由来の pageId を UUID 形式に限定する(Notion URL への注入防御)。 */
function assertPageId(id: string): string {
  if (!PAGE_ID_RE.test(id)) throw new Error(`不正な pageId: ${id}`);
  return id;
}

/** ステージファイルは .growth-tmp 配下に限定する(パストラバーサル防御)。 */
function assertStagePath(file: string): string {
  const resolved = path.resolve(file);
  if (resolved !== STAGE_DIR && !resolved.startsWith(STAGE_DIR + path.sep)) {
    throw new Error(`修正案ファイルは .growth-tmp 配下のみ許可です: ${file}`);
  }
  return resolved;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

function approveUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return `${base}/growth/approve`;
}

function statusFilter(value: string): unknown {
  return { property: REVISE_PROPS.status, select: { equals: value } };
}

async function rowsByStatus(value: string, options: NotionApiOptions): Promise<ReviseRow[]> {
  const { pages } = await queryDataSource(
    IDEA_DS,
    { filter: statusFilter(value), pageSize: 100 },
    options
  );
  return pages.map(reviseRowFromPage);
}

// #138: Flex(リッチカード)で送る。altText は Flex 非対応環境向けのフォールバック文。
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
  const staleIds = new Set(selectStaleReviseIds(rows, Date.now(), REVISE_TIMEOUT_MS));
  for (const row of rows) {
    if (!staleIds.has(row.id)) continue;
    await write(row.id, buildReviseFailProps(REAP_REASON), options);
    await notifyFlex(
      buildReviseFailMessage(row.title, REAP_REASON),
      buildReviseFailFlex({ title: row.title, approveUrl: approveUrl(), reason: REAP_REASON })
    );
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
  await write(row.id, buildReviseProcessingProps(), options);
  process.stdout.write(
    `${JSON.stringify({
      pageId: row.id,
      title: row.title,
      outline: row.outline,
      instructions: row.instructions,
    })}\n`
  );
}

async function present(pageId: string, file: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const proposal = (await readFile(assertStagePath(file), "utf-8")).trim();
  if (!proposal) throw new Error("修正案ファイルが空です。");
  const row = reviseRowFromPage(await getPage(pageId, options));
  await write(pageId, buildReviseProposalProps(proposal), options);
  // #138: リッチカードで提示(タイトル＋反映件数＋冒頭抜粋＋承認画面ボタン)。altText は従来テキスト。
  await notifyFlex(
    buildRevisePresentMessage(row.title, approveUrl()),
    buildRevisePresentFlex({
      title: row.title,
      approveUrl: approveUrl(),
      instructionCount: row.instructions.length,
      proposalExcerpt: excerptLines(proposal, 4),
    })
  );
}

async function fail(pageId: string, reason: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const title = reviseRowFromPage(await getPage(pageId, options)).title;
  await write(pageId, buildReviseFailProps(reason), options);
  await notifyFlex(
    buildReviseFailMessage(title, reason),
    buildReviseFailFlex({ title, approveUrl: approveUrl(), reason })
  );
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
      if (!a || !b) throw new Error("使い方: present <pageId> <proposalFile>");
      return present(a, b, options);
    case "fail":
      if (!a || !b) throw new Error("使い方: fail <pageId> <reason>");
      return fail(a, b, options);
    default:
      throw new Error("使い方: revise-cli <reap|next|present|fail> ...");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`revise-cli に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
