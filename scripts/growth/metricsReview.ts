/**
 * 成績ボードの判定ラベル(#計測強化 S3)。純ロジック(I/O なし)。
 * 「数字の一覧」を「次の打ち手が分かる」状態にするため、成績から行動ラベルを導く。
 * 承認画面(src)からは src/lib/growth/metricsReview.ts 経由で参照する。
 */

import type { ArticleMetrics } from "./metrics";
import { reservationIntent } from "./ctaEvents";

export type ReviewLabel =
  | "伸びている"
  | "CTR弱い"
  | "順位あと少し"
  | "読まれるが予約意図弱い"
  | "予約意図未計測"
  | "要改稿"
  | "未計測";

const DAY_MS = 86_400_000;
// 公開後の見直しタイミング(日)。
const REVIEW_DAYS = 28;
// CTR弱い: 検索表示は多いがクリックされない。
const CTR_WEAK_IMPRESSIONS = 100;
const CTR_WEAK_THRESHOLD = 0.03;
// 順位あと少し: 1ページ目手前の平均掲載順位。
const POSITION_NEAR_MIN = 5;
const POSITION_NEAR_MAX = 15;
// 読まれるが CTA弱い: 一定数読まれているのに CTA キーイベントが 0。
const CTA_WEAK_VIEWS = 50;
// 要改稿: 公開後しばらく経っても低調。
const REWRITE_VIEWS = 50;
const REWRITE_CLICKS = 10;

/** publishedAt(ISO) から経過日数を切り捨てで算出する。不正な日付は null。 */
export function daysSincePublished(publishedAt: string, nowMs: number): number | null {
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return null;
  return Math.floor((nowMs - t) / DAY_MS);
}

/**
 * 成績から「次の打ち手」が分かる判定ラベルを作る(複数可)。
 * daysPublished は公開後経過日数(不明は null。要改稿の判定にのみ使う)。
 * 表示もクリックも無い記事は ["未計測"] のみを返す。
 */
export function reviewLabels(
  metrics: ArticleMetrics,
  daysPublished: number | null
): ReviewLabel[] {
  const views = metrics.views.current;
  const search = metrics.search;
  const clicks = search?.clicks.current ?? 0;
  const reservationClicks = metrics.ctaEvents ? reservationIntent(metrics.ctaEvents).current : 0;
  const ctaEventsMeasured = metrics.ctaEventsMeasured === true;

  if (views === 0 && clicks === 0) return ["未計測"];

  const labels: ReviewLabel[] = [];

  if (
    search &&
    search.impressions.current >= CTR_WEAK_IMPRESSIONS &&
    search.ctr.current < CTR_WEAK_THRESHOLD
  ) {
    labels.push("CTR弱い");
  }
  if (
    search &&
    search.position.current >= POSITION_NEAR_MIN &&
    search.position.current <= POSITION_NEAR_MAX
  ) {
    labels.push("順位あと少し");
  }
  if (views >= CTA_WEAK_VIEWS) {
    if (!ctaEventsMeasured) {
      labels.push("予約意図未計測");
    } else if (reservationClicks === 0) {
      labels.push("読まれるが予約意図弱い");
    }
  }

  const needsRewrite =
    daysPublished !== null &&
    daysPublished >= REVIEW_DAYS &&
    views < REWRITE_VIEWS &&
    clicks < REWRITE_CLICKS;
  if (needsRewrite) labels.push("要改稿");

  // 伸びている: 表示 or 検索クリックが前週比プラス。要改稿(低調)とは相反するので併記しない。
  const up = (metrics.views.deltaPct ?? 0) > 0 || (search?.clicks.deltaPct ?? 0) > 0;
  if (up && !needsRewrite) labels.push("伸びている");

  return labels;
}

/** 判定ラベルの母数が小さく参考値かどうか。true なら表示側で注記する。 */
export function isLowSample(metrics: ArticleMetrics): boolean {
  const impressions = metrics.search?.impressions.current ?? 0;
  return impressions < CTR_WEAK_IMPRESSIONS && metrics.views.current < CTA_WEAK_VIEWS;
}
