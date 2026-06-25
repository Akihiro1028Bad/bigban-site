/**
 * 構成案修正ループ(Epic #40 / #44)の決定的オペレーション CLI(headless poller 用)。
 *
 *   npm run growth:revise -- reap                       # 処理中のstale(>15分)を失敗に回収＋通知
 *   npm run growth:revise -- next                       # 依頼中を1件ロック(処理中)し JSON を標準出力
 *   npm run growth:revise -- present <pageId>           # 修正案(構成案/タイトル)を書き込み提示中＋通知
 *   npm run growth:revise -- fail <pageId> <reason>     # 失敗にして理由＋通知
 *
 * #139 B: present は規約パス2本(.growth-tmp/revise-proposal.txt=構成案 / revise-title.txt=タイトル)
 *         から、存在する方だけ提示する(片方だけの提案を許容)。
 *
 * claude(revise-outline.md)は「テキストの修正」だけを担い、Notion 書き込み・通知・
 * reaper・ロックはこの CLI が決定的に行う(stdout 不信・純ロジックは revise.ts でテスト済み)。
 * GROWTH_DRYRUN=1 では書き込み/送信せず内容を表示する。
 * 薄い配線のためカバレッジ対象外(ロジックは revise.ts でテスト済み)。
 */

import "dotenv/config";
import { readFile, rm } from "node:fs/promises";
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
// 修正案ステージの許可ディレクトリ。present は固定ファイル名のみ読むためトラバーサルは起きない。
const STAGE_DIR = path.resolve(process.cwd(), ".growth-tmp");
// #139 B: 構成案・タイトルの修正案ステージ(規約パス)。claude はこの2ファイルに書き出す。
const OUTLINE_STAGE = path.join(STAGE_DIR, "revise-proposal.txt");
const TITLE_STAGE = path.join(STAGE_DIR, "revise-title.txt");

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

/**
 * #139 B: 前回実行の修正案ステージ(構成案/タイトル)を消す。present は「存在する方」を提示するため、
 * 別記事の残骸が混入しないよう、新しい行をロックする next の冒頭で必ずクリアする。
 */
async function clearStages(): Promise<void> {
  await rm(OUTLINE_STAGE, { force: true });
  await rm(TITLE_STAGE, { force: true });
}

/** ステージファイルを読む。存在しない/空なら null(片方だけの提案を許容)。 */
async function readStage(file: string): Promise<string | null> {
  try {
    const text = (await readFile(file, "utf-8")).trim();
    return text || null;
  } catch {
    return null;
  }
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

/** reaper: 処理中・依頼中のまま放置された行(PC停止等)を失敗へ回収し通知する(C2 止血)。 */
async function reap(options: NotionApiOptions): Promise<void> {
  const rows = [
    ...(await rowsByStatus("処理中", options)),
    ...(await rowsByStatus("依頼中", options)),
  ];
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
  // 別記事の残骸を提示しないよう、claude が書き出す前にステージを掃除する。
  await clearStages();
  await write(row.id, buildReviseProcessingProps(), options);
  process.stdout.write(
    `${JSON.stringify({
      pageId: row.id,
      title: row.title,
      outline: row.outline,
      instructions: row.instructions,
      // #139 B: タイトル修正の文脈(現在タイトル=title、タイトルへの指示=titleInstruction)。
      titleInstruction: row.titleInstruction,
    })}\n`
  );
}

async function present(pageId: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  // #139 B: 構成案・タイトルの2ステージから、存在する方だけ提示する。
  const proposal = await readStage(OUTLINE_STAGE);
  const titleProposal = await readStage(TITLE_STAGE);
  if (!proposal && !titleProposal) {
    throw new Error("修正案ファイルが空です(構成案・タイトルとも無し)。");
  }
  const row = reviseRowFromPage(await getPage(pageId, options));
  await write(pageId, buildReviseProposalProps(proposal, titleProposal), options);
  // #138/#139 B: リッチカードで提示(タイトル＋反映件数＋新タイトル＋冒頭抜粋＋承認画面ボタン)。
  await notifyFlex(
    buildRevisePresentMessage(row.title, approveUrl()),
    buildRevisePresentFlex({
      title: row.title,
      approveUrl: approveUrl(),
      instructionCount: row.instructions.length,
      proposalExcerpt: proposal ? excerptLines(proposal, 4) : "",
      titleProposal: titleProposal ?? "",
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
      if (!a) throw new Error("使い方: present <pageId>");
      return present(a, options);
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
