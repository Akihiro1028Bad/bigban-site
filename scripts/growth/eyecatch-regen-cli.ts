/**
 * アイキャッチ AI 再生成ループ(Epic #140 / #144)の決定的オペレーション CLI(headless poller 用)。
 *
 *   npm run growth:eyecatch-regen -- reap                    # 処理中のstale(>15分)を失敗に回収＋通知
 *   npm run growth:eyecatch-regen -- peek                    # 依頼中の件数を読み取り専用で出力
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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { patchDraft } from "./content";
import { growthEndpoint, growthMediaForRow } from "./endpoint";
import {
  buildRegenDoneProps,
  buildRegenFailProps,
  buildRegenProcessingProps,
  buildRegenDoneMessage,
  buildRegenDoneFlex,
  buildRegenFailMessage,
  REGEN_PROPS,
  REGEN_TIMEOUT_MS,
  regenRowFromPage,
  type RegenRow,
} from "./eyecatch-regen";
import type { FlexContainer } from "./digest-flex";
import { defaultFetch } from "./http";
import { appendLearningLog, buildLearningLogFailNotice } from "./learningLog";
import { pushFlexMessage, pushTextMessage } from "./line";
import { reapStaleRows } from "./loopReaper";
import {
  buildEyecatchMirrorProps,
  createPage,
  getPage,
  updatePageProps,
  type NotionApiOptions,
  type NotionPage,
} from "./notion";
import { queryAllDataSource } from "./notionRepository";
import {
  failureSignature,
  shouldSendFailureNotice,
  type NotifyThrottleRecord,
} from "./notify-throttle";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const REAP_REASON = "処理が15分以上完了しませんでした(PC再起動等の可能性)。もう一度再生成を依頼できます。";
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);
const PAGE_ID_RE = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const WINDOW_MS = 30 * 60 * 1000;
const LEARNING_LOG_THROTTLE_STATE_PATH = ".growth-tmp/learning-log-notify.json";
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
    // 下書きへの書き込みは 単一APIキーに限定する(security H-1)。
    // 削除も可能な MANAGEMENT キーへはフォールバックしない(最小権限)。
    apiKey: requireEnv("MICROCMS_API_KEY"),
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

function selectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function endpointForPage(page: NotionPage): string {
  return growthEndpoint(growthMediaForRow(selectName(page, "媒体")));
}

async function rowsByStatus(value: string, options: NotionApiOptions): Promise<RegenRow[]> {
  const pages = await queryAllDataSource(
    IDEA_DS,
    { filter: statusFilter(value) },
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

/** 完了通知を Flex で送る(#162)。altText は Flex 非対応環境のフォールバック。 */
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

function readThrottleRecords(): NotifyThrottleRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(LEARNING_LOG_THROTTLE_STATE_PATH, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): NotifyThrottleRecord[] => {
      if (
        item &&
        typeof item === "object" &&
        "signature" in item &&
        "sentAtMs" in item &&
        typeof item.signature === "string" &&
        typeof item.sentAtMs === "number"
      ) {
        return [{ signature: item.signature, sentAtMs: item.sentAtMs }];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function writeThrottleRecords(records: readonly NotifyThrottleRecord[]): void {
  mkdirSync(dirname(LEARNING_LOG_THROTTLE_STATE_PATH), { recursive: true });
  writeFileSync(LEARNING_LOG_THROTTLE_STATE_PATH, `${JSON.stringify(records)}\n`);
}

async function notifyLearningLogFailThrottled(kind: string): Promise<void> {
  try {
    const signature = failureSignature("learning-log", kind);
    const decision = shouldSendFailureNotice(
      readThrottleRecords(),
      signature,
      Date.now(),
      WINDOW_MS
    );
    writeThrottleRecords(decision.records);
    if (!decision.send) return;

    const message = buildLearningLogFailNotice(kind);
    if (DRYRUN) {
      process.stdout.write(`[dry-run] LINE: ${message}\n`);
      return;
    }
    await pushTextMessage(requireEnv("LINE_GROUP_ID"), message, {
      channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
      fetchFn: defaultFetch,
    });
  } catch {
    // 学習ログ失敗通知はベストエフォート。本処理の exit には影響させない。
  }
}

async function countRecentImageAttempts(
  pageId: string,
  style: string,
  options: NotionApiOptions
): Promise<number> {
  const dataSourceId = process.env.GROWTH_LEARNING_LOG_DS;
  if (!dataSourceId) return 0;
  const cutoff = new Date(Date.now() - 4 * 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const pages = await queryAllDataSource(
      dataSourceId,
      {
        filter: {
          and: [
            { property: "種別", select: { equals: "画像試行" } },
            { property: "ページID", rich_text: { contains: pageId } },
            { property: "対象", rich_text: { equals: style } },
            { property: "記録時刻", date: { on_or_after: cutoff } },
          ],
        },
      },
      options
    );
    return pages.length;
  } catch {
    return 0;
  }
}

async function recordImageAttempt(
  pageId: string,
  title: string,
  style: string,
  result: "成功" | "失敗",
  options: NotionApiOptions
): Promise<void> {
  try {
    const dataSourceId = process.env.GROWTH_LEARNING_LOG_DS;
    const attempt = (await countRecentImageAttempts(pageId, style, options)) + 1;
    if (DRYRUN) {
      process.stdout.write(`[dry-run] learning-log 画像試行 ${style} ×${attempt} ${result}\n`);
      return;
    }
    const outcome = await appendLearningLog(
      { kind: "画像試行", pageId, title, style, result, attempt },
      {
        dataSourceId,
        notionOptions: options,
        createPageFn: createPage,
        nowIso: new Date().toISOString(),
      }
    );
    if (outcome.status === "failed") {
      process.stderr.write(`learning-log 画像試行の記録に失敗: ${String(outcome.error)}\n`);
      await notifyLearningLogFailThrottled("画像試行");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`learning-log 画像試行の記録をスキップしました: ${message}\n`);
  }
}

/** reaper: 処理中・依頼中のまま放置された行(PC停止等)を失敗へ回収し通知する(C2 止血)。 */
async function reap(options: NotionApiOptions): Promise<void> {
  const rows = [
    ...(await rowsByStatus("処理中", options)),
    ...(await rowsByStatus("依頼中", options)),
  ];
  await reapStaleRows(rows, Date.now(), REGEN_TIMEOUT_MS, async (row) => {
    await write(row.id, buildRegenFailProps(), options);
    await notify(buildRegenFailMessage(row.title, REAP_REASON));
    process.stderr.write(`reaped(失敗化): ${row.id}\n`);
  });
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

/** next が拾う候補(依頼中)を読み取り専用で数える。claim/通知はしない。 */
async function peek(options: NotionApiOptions): Promise<void> {
  const rows = await rowsByStatus("依頼中", options);
  process.stdout.write(`${rows.length}\n`);
}

/** 生成済み画像 URL で下書きのアイキャッチを差し替え、完了にして通知する。 */
async function done(pageId: string, eyecatchUrl: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  if (!ASSET_URL_RE.test(eyecatchUrl)) {
    throw new Error(`eyecatchUrl は microCMS アセットURLにしてください: ${eyecatchUrl}`);
  }
  const page = await getPage(pageId, options);
  const row = regenRowFromPage(page);
  const endpoint = endpointForPage(page);
  if (!row.contentId) throw new Error("下書きID(contentId)がありません。");
  if (DRYRUN) {
    process.stdout.write(`[dry-run] patchDraft ${endpoint}/${row.contentId} eyecatch=${eyecatchUrl}\n`);
  } else {
    await patchDraft(endpoint, row.contentId, { eyecatch: eyecatchUrl }, contentOptions());
  }
  await write(
    pageId,
    { ...buildEyecatchMirrorProps(eyecatchUrl), ...buildRegenDoneProps() },
    options
  );
  await notifyFlex(
    buildRegenDoneMessage(row.title, approveUrl()),
    buildRegenDoneFlex(row.title, approveUrl())
  );
  await recordImageAttempt(pageId, row.title, "eyecatch", "成功", options);
}

async function fail(pageId: string, reason: string, options: NotionApiOptions): Promise<void> {
  assertPageId(pageId);
  const title = regenRowFromPage(await getPage(pageId, options)).title;
  await write(pageId, buildRegenFailProps(), options);
  await notify(buildRegenFailMessage(title, reason));
  await recordImageAttempt(pageId, title, "eyecatch", "失敗", options);
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
    case "done":
      if (!a || !b) throw new Error("使い方: done <pageId> <eyecatchUrl>");
      return done(a, b, options);
    case "fail":
      if (!a || !b) throw new Error("使い方: fail <pageId> <reason>");
      // 異常に長い通知本文を防ぐ(security M-3)。
      return fail(a, b.slice(0, 200), options);
    default:
      throw new Error("使い方: eyecatch-regen-cli <reap|peek|next|done|fail> ...");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`eyecatch-regen-cli に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
