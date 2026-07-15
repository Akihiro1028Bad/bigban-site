/**
 * 予約公開の到来分公開 CLI(#H24・常時稼働 PC のスケジュール実行用)。
 *
 *   npm run growth:publish-due                 # 予約時刻が到来した公開OKの下書きを公開する
 *   GROWTH_DRYRUN=1 npm run growth:publish-due # 公開せず対象だけ表示
 *
 * microCMS は書き込み API で予約公開を持たないため、承認画面は予約時刻を Notion `公開予約時刻` に
 * 書くだけ(`/api/growth/publish/schedule`)。実際の公開はこの CLI が到来分だけ行う(プル型)。
 * 純ロジック(到来分の選別)は publishQueue.ts でテスト済み。薄い I/O 配線のためカバレッジ対象外。
 */

import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getColumnSlugs } from "../../src/lib/microcms/columnsQueries";
import { getNewsSlugs } from "../../src/lib/microcms/queries";

import { hasPendingBodyImage } from "./body-image-insert";
import { BODY_REGEN_BUSY_STATUSES, bodyRegenRowFromPage } from "./body-image-regen";
import { removeAiDisclaimer } from "./aiDisclaimer";
import { patchDraft, publishContent, resolveRetryConfig } from "./content";
import { REGEN_BUSY_STATUSES, regenRowFromPage } from "./eyecatch-regen";
import { growthEndpoint, growthMediaForRow } from "./endpoint";
import { defaultFetch } from "./http";
import { knownArticlePathsForMedia } from "./knownArticlePaths";
import { pushTextMessage } from "./line";
import {
  buildScheduleProps,
  PUBLISH_SCHEDULE_PROP,
  publishQueueItemFromPage,
  selectDuePublications,
} from "./publishQueue";
import {
  buildPublishDueFailureMessage,
  buildPublishDueGateBlockMessage,
  buildPublishDuePartialStatusMessage,
  buildPublishDueSkipMessage,
  type GateBlockedPublication,
  type PartialStatusPublication,
  type SkippedPublication,
} from "./publishDueNotify";
import { safeExternalError } from "./externalApiError";
import {
  updatePageProps,
  updatePageSelect,
  type NotionApiOptions,
  type NotionPage,
} from "./notion";
import { queryAllDataSource } from "./notionRepository";
import {
  failureSignature,
  shouldSendFailureNotice,
  type NotifyThrottleRecord,
} from "./notify-throttle";
import { publishGateReason, resolveGateArticleType } from "./publishGate";
import { confirmedFactsFromPage } from "./sourceLedger";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const STATUS_PROP = "ステータス";
const PUBLISHED_STATUS = "公開済み";
// microCMS contentId の許可文字＋長さ上限(draft/eyecatch route と同じ)。不正値・過大値を URL パスに載せない。
const CONTENT_ID_RE = /^[a-z0-9-]{1,64}$/;
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);
const IMAGE_GENERATION_PENDING_MESSAGE = "画像生成の完了を待ってから公開してください。";
const NOTIFY_THROTTLE_PATH = ".growth-tmp/notify-throttle.json";
const DEFAULT_NOTIFY_WINDOW_MS = 10 * 60 * 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

function richTextOf(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { rich_text?: { plain_text?: string }[] } | undefined;
  return (value?.rich_text ?? []).map((r) => r.plain_text ?? "").join("");
}

function selectOf(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function titleOf(page: NotionPage): string {
  const value = page.properties["タイトル案"] as { title?: { plain_text?: string }[] } | undefined;
  return (value?.title ?? []).map((r) => r.plain_text ?? "").join("").trim();
}

async function readThrottleRecords(): Promise<NotifyThrottleRecord[]> {
  try {
    const raw = await readFile(NOTIFY_THROTTLE_PATH, "utf-8");
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? (data as NotifyThrottleRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeThrottleRecords(records: readonly NotifyThrottleRecord[]): Promise<void> {
  await mkdir(path.dirname(NOTIFY_THROTTLE_PATH), { recursive: true }).catch(() => {});
  await writeFile(NOTIFY_THROTTLE_PATH, JSON.stringify(records), "utf-8").catch(() => {});
}

function hasUnfinishedImageGeneration(page: NotionPage): boolean {
  const bodyHtml = richTextOf(page, "下書き本文HTML");
  return (
    hasPendingBodyImage(bodyHtml) ||
    BODY_REGEN_BUSY_STATUSES.includes(bodyRegenRowFromPage(page).status) ||
    REGEN_BUSY_STATUSES.includes(regenRowFromPage(page).status)
  );
}

async function notifyLine(text: string): Promise<void> {
  const to = process.env.LINE_GROUP_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!to || !token) return;
  await pushTextMessage(to, text, { channelAccessToken: token, fetchFn: defaultFetch });
}

async function main(): Promise<void> {
  const notionOpts = notionOptions();
  const serviceDomain = requireEnv("MICROCMS_SERVICE_DOMAIN");
  const microcmsApiKey = requireEnv("MICROCMS_API_KEY");
  const retry = resolveRetryConfig(process.env);
  const managementOpts = { serviceDomain, apiKey: microcmsApiKey, fetchFn: defaultFetch, retry };
  const contentOpts = { serviceDomain, apiKey: microcmsApiKey, fetchFn: defaultFetch, retry };

  // 予約が入っているページを取得(到来判定・公開可否は純ロジックで)。
  const pages = await queryAllDataSource(
    IDEA_DS,
    { filter: { property: PUBLISH_SCHEDULE_PROP, date: { is_not_empty: true } } },
    notionOpts
  );

  const byId = new Map(pages.map((p) => [p.id, p]));
  const items = pages.map(publishQueueItemFromPage);
  const due = selectDuePublications(items, Date.now());

  let published = 0;
  const skipped: SkippedPublication[] = [];
  const gateBlocked: GateBlockedPublication[] = [];
  const partialStatusFailures: PartialStatusPublication[] = [];
  const windowEnv = Number(process.env.GROWTH_NOTIFY_WINDOW_MS);
  const windowMs =
    Number.isInteger(windowEnv) && windowEnv > 0 ? windowEnv : DEFAULT_NOTIFY_WINDOW_MS;
  let throttleRecords = await readThrottleRecords();
  for (const item of due) {
    const page = byId.get(item.id);
    if (!page) continue;
    const contentId = richTextOf(page, "下書きID").trim();
    if (!CONTENT_ID_RE.test(contentId)) {
      console.warn(`[publish-due] 不正な contentId のためスキップ: ${titleOf(page)} (${contentId})`);
      skipped.push({ title: titleOf(page), contentId });
      continue;
    }
    if (hasUnfinishedImageGeneration(page)) {
      console.warn(`[publish-due] ${IMAGE_GENERATION_PENDING_MESSAGE}: ${titleOf(page) || page.id}`);
      continue;
    }
    const title = titleOf(page);
    if (DRYRUN) {
      console.log(`[publish-due][dryrun] ${title || page.id} (contentId=${contentId})`);
      continue;
    }
    // 公開直前に承認画面の正タイトルと、AI 免責注記を除去した本文を下書きへ同期(#176 と同じ)。
    const rawBody = richTextOf(page, "下書き本文HTML");
    const media = growthMediaForRow(selectOf(page, "媒体"));
    const endpoint = growthEndpoint(media);
    let knownNewsPaths: ReadonlySet<string> | undefined;
    try {
      const paths = await knownArticlePathsForMedia(media, {
        getColumnSlugs,
        getNewsSlugs,
      });
      knownNewsPaths = new Set(paths);
    } catch {
      knownNewsPaths = undefined;
    }
    const reason = publishGateReason(
      rawBody,
      title,
      resolveGateArticleType({}),
      knownNewsPaths,
      confirmedFactsFromPage(page)
    );
    if (reason) {
      console.warn(`[publish-due] 公開直前ゲートでスキップ: ${title || page.id}: ${reason}`);
      const signature = failureSignature("publish-due-gate", `${contentId}:${reason}`);
      const decision = shouldSendFailureNotice(throttleRecords, signature, Date.now(), windowMs);
      throttleRecords = decision.records;
      if (decision.send) gateBlocked.push({ title, contentId, reason });
      continue;
    }
    const { body: cleanBody, removed } = removeAiDisclaimer(rawBody);
    const patch: Record<string, unknown> = {};
    if (title) patch.title = title;
    if (removed) patch.bodyHtml = cleanBody;
    if (Object.keys(patch).length > 0) await patchDraft(endpoint, contentId, patch, contentOpts);
    // PATCH status PUBLISH は冪等(既に公開済みでも PUBLISH のまま)。
    await publishContent(endpoint, contentId, managementOpts);
    // microCMS 公開後の Notion 同期失敗は「外部公開済み」として明示し、総失敗にしない。
    try {
      await updatePageSelect(page.id, STATUS_PROP, PUBLISHED_STATUS, notionOpts);
    } catch (error: unknown) {
      console.warn(`[publish-due] Notion ステータス更新に失敗(公開は完了): ${title || page.id}`, error);
      partialStatusFailures.push({ title, contentId });
      published += 1;
      continue;
    }
    // 予約の消去は付随処理。失敗しても公開自体は完了しているのでループは止めず警告だけ出す
    // (ステータスは既に公開済みなので次回ループで再公開されることはない)。
    try {
      await updatePageProps(page.id, buildScheduleProps(null), notionOpts);
    } catch (error: unknown) {
      console.warn(`[publish-due] 予約消去に失敗(公開は完了): ${title || page.id}`, error);
    }
    published += 1;
    console.log(`[publish-due] 公開: ${title || page.id}`);
  }

  const summary = `⏰ 予約公開: ${published}件 (対象 ${due.length}件)`;
  console.log(summary);
  if (!DRYRUN && published > 0) await notifyLine(summary);

  // 不正 contentId のスキップを沈黙させない(#220): 取り残された記事を LINE 通知する。
  const skipMessage = buildPublishDueSkipMessage(skipped);
  if (!DRYRUN && skipMessage) await notifyLine(skipMessage);

  await writeThrottleRecords(throttleRecords);
  const gateBlockMessage = buildPublishDueGateBlockMessage(gateBlocked);
  if (!DRYRUN && gateBlockMessage) await notifyLine(gateBlockMessage);
  const partialStatusMessage = buildPublishDuePartialStatusMessage(partialStatusFailures);
  if (!DRYRUN && partialStatusMessage) await notifyLine(partialStatusMessage);
}

main().catch(async (error: unknown) => {
  console.error("[publish-due] 失敗:", error);
  // 予約公開の総失敗を沈黙させない(#220): publish-draft と対称に LINE 通知する(best-effort)。
  if (!DRYRUN) {
    try {
      await notifyLine(buildPublishDueFailureMessage(safeExternalError(error)));
    } catch (notifyError: unknown) {
      const m = notifyError instanceof Error ? notifyError.message : String(notifyError);
      console.error(`[publish-due] 失敗の LINE 通知も送れませんでした: ${m}`);
    }
  }
  process.exitCode = 1;
});
