/**
 * シェル(TopBar/LeftRail)の統計と同期ラベルの純ロジック(#proto P1)。DOM/IO 非依存。
 *
 * proto の SEGMENTS / 統計ピル / 同期ラベルを本番 PendingItem + isActionable へ写像する(AD4)。
 * 当面の縮約(AD5): publishedTotal は proto の「今週公開」相当だが publishedAt 境界が surface
 * できないため stage==="published" の総数(ラベルも「公開済み」)。境界が surface できれば差し替え。
 * queueReady は partitionPublishQueue の ready 近似(stage==="drafted" && isDraftReady)。厳密な
 * 振り分け・到来判定は PublishQueue 側が publishQueue.ts で行う。
 */

import { isActionable } from "./board";
import type { PendingItem } from "./types";

export type ShellSegmentKey = "all" | "awaiting" | "generating" | "published";

export interface ShellCounts {
  awaiting: number;
  publishedTotal: number;
  proposalPending: number;
  articlePending: number;
  queueReady: number;
  segmentCounts: Record<ShellSegmentKey, number>;
}

// published/rejected は「あなたのアクション待ち」に含まない段階。isActionable は
// isAwaitingDownstream(queued/generating/approved)のみ除外するため、ここで追加除外する。
const TERMINAL_STAGES: ReadonlySet<string> = new Set([
  "published",
  "rejected",
  "completed",
  "in_progress",
  "executed",
]);

/** TopBar 段階セグメント / 統計ピル / LeftRail バッジの件数を一括算出する。 */
export function deriveShellCounts(
  items: readonly PendingItem[],
  decided: Record<string, string | undefined>,
): ShellCounts {
  let awaiting = 0;
  let generating = 0;
  let published = 0;
  let proposalPending = 0;
  let articlePending = 0;
  let queueReady = 0;
  for (const it of items) {
    const actionable = isActionable(it, decided) && !TERMINAL_STAGES.has(it.stage);
    if (actionable) awaiting += 1;
    if (it.stage === "generating") generating += 1;
    if (it.stage === "published") published += 1;
    if (it.kind === "proposal" && actionable) proposalPending += 1;
    if (it.kind === "idea" && actionable) articlePending += 1;
    if (it.stage === "drafted" && it.isDraftReady === true) queueReady += 1;
  }
  return {
    awaiting,
    publishedTotal: published,
    proposalPending,
    articlePending,
    queueReady,
    segmentCounts: {
      all: items.length,
      awaiting,
      generating,
      published,
    },
  };
}

export interface SyncAgo {
  label: string | null;
  stale: boolean;
}

/** 盤の最終取得時刻からの経過ラベル。null=未取得。2分以上で stale。負経過は 0 に丸める。 */
export function syncAgoLabel(nowMs: number, updatedAtMs: number | null): SyncAgo {
  if (updatedAtMs === null) return { label: null, stale: false };
  const minutesAgo = Math.max(0, Math.floor((nowMs - updatedAtMs) / 60_000));
  const label = minutesAgo < 1 ? "たった今" : `${minutesAgo}分前`;
  return { label, stale: minutesAgo >= 2 };
}
