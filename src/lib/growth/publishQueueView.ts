/**
 * 承認画面(proto P5b)の公開キュー表示用 純ロジック。DOM/IO 非依存。
 *
 * - 3セクション化: 既存 `partitionPublishQueue`(ready/blocked)を土台に、予約時刻付き(ready)を
 *   scheduled として切り出し「公開OK / 予約済み / 要対応」の proto 3レーンへ対応させる。
 *   分類そのもの(下書き済み判定・公開可否理由)は既存純ロジックを呼ぶだけで重複実装しない。
 * - 予約ピッカー: proto `SchedulePicker.tsx` の formatSchedule / プリセット計算を、
 *   `Date.now()` を使わず `nowMs` 注入の決定的純関数に移植する(T4/T5 が消費)。
 */

import { partitionPublishQueue } from "./publishQueue";

import type { PendingItem } from "@/app/growth/approve/types";

/** 公開キューの proto 3セクション。scheduled は ready のうち予約時刻付き。 */
export interface PublishQueueSplit {
  ready: PendingItem[];
  scheduled: PendingItem[];
  blocked: { item: PendingItem; reason: string }[];
}

/**
 * 公開キューを ready(即時公開OK) / scheduled(予約済み) / blocked(要対応＋理由) に3分割する。
 * 既存 `partitionPublishQueue` の ready から `scheduledAtMs != null` を scheduled へ切り出す。
 * blocked と reason は既存ロジックからそのまま伝播する(重複実装しない)。
 */
export function splitPublishQueue(items: readonly PendingItem[]): PublishQueueSplit {
  const { ready: partitionedReady, blocked } = partitionPublishQueue(items);
  const ready: PendingItem[] = [];
  const scheduled: PendingItem[] = [];
  for (const item of partitionedReady) {
    if (item.scheduledAtMs != null) scheduled.push(item);
    else ready.push(item);
  }
  return { ready, scheduled, blocked };
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * proto 逐語の予約時刻表示。「1/25(木) 09:00」形式(月日は無ゼロ埋め・時分はゼロ埋め)。
 */
export function formatSchedule(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]}) ${hh}:${mm}`;
}

/** base から addDays 日後の hour:00:00.000 を返す(proto atTime 相当)。 */
function atTime(baseMs: number, addDays: number, hour: number): Date {
  const d = new Date(baseMs);
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** base 以降で最初の「来週月曜」09:00 を返す(当日が月曜なら7日後・常に未来。proto nextMonday 相当)。 */
function nextMonday(baseMs: number): Date {
  const d = new Date(baseMs);
  const delta = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** 予約プリセット1件(表示ラベルと確定時刻ms)。 */
export interface SchedulePreset {
  label: string;
  atMs: number;
}

/**
 * proto の予約プリセット(今夜21:00 / 明日09:00 / 明日12:00 / 来週月曜09:00)を
 * `nowMs` 注入の決定的純関数として返す。
 * proto 同様「今夜21:00」は当日の21:00をそのまま指す(21時を過ぎていてもロールしない)。
 */
export function schedulePresets(nowMs: number): SchedulePreset[] {
  return [
    { label: "今夜 21:00", atMs: atTime(nowMs, 0, 21).getTime() },
    { label: "明日 09:00", atMs: atTime(nowMs, 1, 9).getTime() },
    { label: "明日 12:00", atMs: atTime(nowMs, 1, 12).getTime() },
    { label: "来週月曜 09:00", atMs: nextMonday(nowMs).getTime() },
  ];
}
