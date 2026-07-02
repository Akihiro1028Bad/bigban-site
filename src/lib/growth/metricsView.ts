/**
 * 成績ボードの判定ラベル(#proto P5a・純ロジック / I/O なし)。
 *
 * proto `approve-proto/metricsView.ts` の `reviewLabels`(行動ラベル)を、本番 `ArticleMetrics`
 * 型に合わせて移植したもの。判定の閾値・文言は本番現行(`scripts/growth/metricsReview.ts` /
 * `approve/PerformanceBoard.tsx` の `LABEL_CLASS`)を尊重して確定している。
 *
 * proto の期間切替(7/28/90日)と Sparkline 系列(`rangeView`/`fitSeries`)は縮約のため
 * 移植しない(YAGNI)。後続 T6(PerformanceBoard 再スキン)はこの `reviewLabels` を import する。
 *
 * 承認画面(src 配下)からはこのモジュール経由で参照する。
 */

import type { ArticleMetrics } from "./metrics";
import { daysSincePublished } from "./metricsReview";

/** 成績から導く行動ラベル。文言は本番 PerformanceBoard の配色マップ(LABEL_CLASS)に対応。 */
export type ReviewLabel =
  | "伸びている"
  | "CTR弱い"
  | "順位あと少し"
  | "読まれるがCTA弱い"
  | "要改稿"
  | "未計測";

// 公開後の見直しタイミング(日)。ここを過ぎても低調なら「要改稿」。
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

/**
 * 成績から「次の打ち手」が分かる判定ラベルを作る(複数該当しうるので配列で返す)。
 *
 * 公開後経過日数は `m.publishedAt`(ISO)から `nowMs` 基準で内部算出する(要改稿の判定にのみ使う)。
 * `publishedAt` が未設定・不正日付なら「要改稿」は付けない(安全側)。
 * 表示もクリックも無い記事は `["未計測"]` のみを返す。
 *
 * @param m 本番 `ArticleMetrics`(views/users/keyEvents は前週比つき・search は任意)。
 * @param nowMs 公開後日数の基準時刻(既定は現在時刻)。テストの決定性のために注入可能。
 */
export function reviewLabels(m: ArticleMetrics, nowMs: number = Date.now()): ReviewLabel[] {
  const views = m.views.current;
  const search = m.search;
  const clicks = search?.clicks.current ?? 0;
  const keyEvents = m.keyEvents?.current ?? 0;

  if (views === 0 && clicks === 0) return ["未計測"];

  const daysPublished = m.publishedAt ? daysSincePublished(m.publishedAt, nowMs) : null;

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
  if (views >= CTA_WEAK_VIEWS && keyEvents === 0) {
    labels.push("読まれるがCTA弱い");
  }

  const needsRewrite =
    daysPublished !== null &&
    daysPublished >= REVIEW_DAYS &&
    views < REWRITE_VIEWS &&
    clicks < REWRITE_CLICKS;
  if (needsRewrite) labels.push("要改稿");

  // 伸びている: 表示 or 検索クリックが前週比プラス。要改稿(低調)とは相反するので併記しない。
  const up = (m.views.deltaPct ?? 0) > 0 || (search?.clicks.deltaPct ?? 0) > 0;
  if (up && !needsRewrite) labels.push("伸びている");

  return labels;
}
