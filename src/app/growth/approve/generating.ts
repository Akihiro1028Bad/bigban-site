/**
 * 生成中の可視化(#108)の純ロジック。DOM/タイマ非依存。
 *
 * 「承認後〜下書き完成」の見えない空白を可視化するための、進捗ステップ・滞留判定・
 * 完了検出を提供する。アニメ/ポーリングの結線は ApproveClient 側。
 */

import type { Stage } from "@/lib/growth/stage";

/** 生成中カードに出す進捗ステップ(取材→構成→推敲)。演出用の固定表示。 */
export const GENERATING_STEPS = ["取材", "構成", "推敲"] as const;

/** 生成待ち/生成中が「滞留」と疑われる閾値(ミリ秒)。約15分。 */
export const STUCK_THRESHOLD_MS = 15 * 60 * 1000;

/** 経過時間が閾値以上なら滞留(自宅PCが止まっている可能性)。 */
export function isStuck(elapsedMs: number, thresholdMs: number): boolean {
  return elapsedMs >= thresholdMs;
}

interface StageItem {
  id: string;
  stage: Stage;
}

/**
 * 直前→最新で新たに「下書き作成済み(drafted)」になった記事の id を返す(完了トースト用)。
 * 直前は drafted でなく、最新で drafted のものだけを拾う。
 */
export function newlyDraftedIds(prev: StageItem[], next: StageItem[]): string[] {
  const prevDrafted = new Set(
    prev.filter((item) => item.stage === "drafted").map((item) => item.id),
  );
  return next
    .filter((item) => item.stage === "drafted" && !prevDrafted.has(item.id))
    .map((item) => item.id);
}

/** 記事が生成待ち/生成中(=自宅PCの処理待ち)か。ポーリング要否・滞留計測の対象判定。 */
export function isInFlight(stage: Stage): boolean {
  return stage === "queued" || stage === "generating";
}
