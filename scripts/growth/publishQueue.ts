/**
 * 公開キュー(#H23/#H24 例外管理型＋予約公開)の純ロジック。DOM/IO 非依存。
 *
 * - 例外管理型: 下書き済み記事を「公開OK(green)」と「要対応(例外)」に振り分け、green を一括公開できるようにする。
 * - 予約公開: microCMS は予約公開を書き込み API で持たないため、予約時刻を Notion に持ち、
 *   常時稼働 PC の publish-due ループが時刻到来分を公開する(プル型)。`selectDuePublications` がその選別。
 */

import type { NotionPage } from "./notion";

/** Notion 記事ネタ案DB に事前追加が必要な予約公開時刻プロパティ名。 */
export const PUBLISH_SCHEDULE_PROP = "公開予約時刻";
const STATUS_PROP = "ステータス";
const PUBLISHED_STATUS = "公開済み";
const DRAFTED_STATUS = "下書き作成済み";
const APPROVED_STATUS = "承認";

/** 予約時刻を Notion に書く/消すプロパティを作る(null で予約解除)。 */
export function buildScheduleProps(scheduledAtIso: string | null): Record<string, unknown> {
  return {
    [PUBLISH_SCHEDULE_PROP]: { date: scheduledAtIso ? { start: scheduledAtIso } : null },
  };
}

/** 公開可否を判定するのに必要な最小形状。 */
export interface PublishReadiness {
  eyecatchUrl?: string;
  hasDraftBody?: boolean;
}

/**
 * アイキャッチ未設定の要対応理由。承認画面の公開キューが「メディアライブラリで差し替える」
 * 導線(#143 後継)を出す行の判別に使うため、文字列を単一ソース化する。
 */
export const EYECATCH_MISSING_REASON = "アイキャッチ未設定";

/** 下書き済み記事が公開できない理由(=例外)。公開可能なら null。 */
export function publishBlockReason(item: PublishReadiness): string | null {
  if (!item.eyecatchUrl) return EYECATCH_MISSING_REASON;
  if (!item.hasDraftBody) return "本文が空";
  return null;
}

/** 公開キューの要素が満たす最小形状。 */
export interface PublishQueueItem extends PublishReadiness {
  id: string;
  stage: string;
  scheduledAtMs?: number | null;
}

function richTextOf(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { rich_text?: { plain_text?: string }[] } | undefined;
  return (value?.rich_text ?? []).map((item) => item.plain_text ?? "").join("");
}

/** Notionページを予約公開判定用の最小形状へ変換する。 */
export function publishQueueItemFromPage(page: NotionPage): PublishQueueItem {
  const statusValue = page.properties[STATUS_PROP] as
    | { select?: { name?: string } | null }
    | undefined;
  const status = statusValue?.select?.name ?? "";
  const contentId = richTextOf(page, "下書きID").trim();
  const scheduledValue = page.properties[PUBLISH_SCHEDULE_PROP] as
    | { date?: { start?: string } | null }
    | undefined;
  const scheduledAt = scheduledValue?.date?.start;
  const scheduledAtMs = scheduledAt ? Date.parse(scheduledAt) : Number.NaN;
  const isDrafted = status === DRAFTED_STATUS || (status === APPROVED_STATUS && contentId !== "");
  return {
    id: page.id,
    stage: isDrafted ? "drafted" : status === PUBLISHED_STATUS ? "published" : "other",
    eyecatchUrl: richTextOf(page, "アイキャッチURL").trim() || undefined,
    hasDraftBody: richTextOf(page, "下書き本文HTML").trim() !== "",
    scheduledAtMs: Number.isNaN(scheduledAtMs) ? null : scheduledAtMs,
  };
}

/**
 * 下書き済み記事を ready(公開OK) と blocked(要対応＋理由) に振り分ける。
 * 下書き済み以外は対象外(キューに出さない)。
 */
export function partitionPublishQueue<T extends PublishQueueItem>(
  items: readonly T[]
): { ready: T[]; blocked: { item: T; reason: string }[] } {
  const ready: T[] = [];
  const blocked: { item: T; reason: string }[] = [];
  for (const item of items) {
    if (item.stage !== "drafted") continue;
    const reason = publishBlockReason(item);
    if (reason) blocked.push({ item, reason });
    else ready.push(item);
  }
  return { ready, blocked };
}

/**
 * 予約時刻が到来した公開可能な下書きを選ぶ(常時稼働 PC の publish-due 用)。
 * 公開できない(例外)記事は予約があっても公開しない。
 */
export function selectDuePublications<T extends PublishQueueItem>(
  items: readonly T[],
  nowMs: number
): T[] {
  return items.filter(
    (item) =>
      item.stage === "drafted" &&
      publishBlockReason(item) === null &&
      typeof item.scheduledAtMs === "number" &&
      item.scheduledAtMs <= nowMs
  );
}
