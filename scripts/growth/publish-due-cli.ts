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

import { hasPendingBodyImage } from "./body-image-insert";
import { BODY_REGEN_BUSY_STATUSES, bodyRegenRowFromPage } from "./body-image-regen";
import { patchDraft, publishContent, resolveRetryConfig } from "./content";
import { REGEN_BUSY_STATUSES, regenRowFromPage } from "./eyecatch-regen";
import { growthEndpoint } from "./endpoint";
import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import {
  buildScheduleProps,
  PUBLISH_SCHEDULE_PROP,
  selectDuePublications,
  type PublishQueueItem,
} from "./publishQueue";
import {
  buildPublishDueFailureMessage,
  buildPublishDueSkipMessage,
  type SkippedPublication,
} from "./publishDueNotify";
import {
  queryDataSource,
  updatePageProps,
  updatePageSelect,
  type NotionApiOptions,
  type NotionPage,
} from "./notion";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const ENDPOINT = growthEndpoint();
const STATUS_PROP = "ステータス";
const PUBLISHED_STATUS = "公開済み";
const DRAFTED_STATUS = "下書き作成済み";
const APPROVED_STATUS = "承認";
// microCMS contentId の許可文字＋長さ上限(draft/eyecatch route と同じ)。不正値・過大値を URL パスに載せない。
const CONTENT_ID_RE = /^[a-z0-9-]{1,64}$/;
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);
const IMAGE_GENERATION_PENDING_MESSAGE = "画像生成の完了を待ってから公開してください。";

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

function dateMsOf(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  const start = value?.date?.start;
  if (!start) return null;
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? null : ms;
}

function titleOf(page: NotionPage): string {
  const value = page.properties["タイトル案"] as { title?: { plain_text?: string }[] } | undefined;
  return (value?.title ?? []).map((r) => r.plain_text ?? "").join("").trim();
}

function hasUnfinishedImageGeneration(page: NotionPage): boolean {
  const bodyHtml = richTextOf(page, "下書き本文HTML");
  return (
    hasPendingBodyImage(bodyHtml) ||
    BODY_REGEN_BUSY_STATUSES.includes(bodyRegenRowFromPage(page).status) ||
    REGEN_BUSY_STATUSES.includes(regenRowFromPage(page).status)
  );
}

/** Notion ページ → 公開キュー判定用の項目。drafted 判定は status＋下書きID から。 */
function toQueueItem(page: NotionPage): PublishQueueItem {
  const status = selectOf(page, STATUS_PROP);
  const contentId = richTextOf(page, "下書きID").trim();
  const isDrafted = status === DRAFTED_STATUS || (status === APPROVED_STATUS && contentId !== "");
  return {
    id: page.id,
    stage: isDrafted ? "drafted" : status === PUBLISHED_STATUS ? "published" : "other",
    eyecatchUrl: richTextOf(page, "アイキャッチURL").trim() || undefined,
    hasDraftBody: richTextOf(page, "下書き本文HTML").trim() !== "",
    scheduledAtMs: dateMsOf(page, PUBLISH_SCHEDULE_PROP),
  };
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
  const managementKey = requireEnv("MICROCMS_MANAGEMENT_API_KEY");
  const contentKey = process.env.MICROCMS_CONTENT_API_KEY ?? managementKey;
  const retry = resolveRetryConfig(process.env);
  const managementOpts = { serviceDomain, apiKey: managementKey, fetchFn: defaultFetch, retry };
  const contentOpts = { serviceDomain, apiKey: contentKey, fetchFn: defaultFetch, retry };

  // 予約が入っているページを取得(到来判定・公開可否は純ロジックで)。
  const { pages } = await queryDataSource(
    IDEA_DS,
    { filter: { property: PUBLISH_SCHEDULE_PROP, date: { is_not_empty: true } }, pageSize: 100 },
    notionOpts
  );

  const byId = new Map(pages.map((p) => [p.id, p]));
  const items = pages.map(toQueueItem);
  const due = selectDuePublications(items, Date.now());

  let published = 0;
  const skipped: SkippedPublication[] = [];
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
    // 公開直前に承認画面の正タイトルを下書きへ同期(#176 と同じ)。
    if (title) await patchDraft(ENDPOINT, contentId, { title }, contentOpts);
    // PATCH status PUBLISH は冪等(既に公開済みでも PUBLISH のまま)。
    await publishContent(ENDPOINT, contentId, managementOpts);
    // 先に Notion ステータスを公開済みにする(=次回ループの再公開を防ぐ要)。
    await updatePageSelect(page.id, STATUS_PROP, PUBLISHED_STATUS, notionOpts);
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
}

main().catch(async (error: unknown) => {
  console.error("[publish-due] 失敗:", error);
  // 予約公開の総失敗を沈黙させない(#220): publish-draft と対称に LINE 通知する(best-effort)。
  if (!DRYRUN) {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await notifyLine(buildPublishDueFailureMessage(reason));
    } catch (notifyError: unknown) {
      const m = notifyError instanceof Error ? notifyError.message : String(notifyError);
      console.error(`[publish-due] 失敗の LINE 通知も送れませんでした: ${m}`);
    }
  }
  process.exitCode = 1;
});
