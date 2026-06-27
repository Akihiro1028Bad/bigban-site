/**
 * 公開後レビューの純ロジック(#計測強化 S7)。公開からの経過日でレビュー到来を判定し、
 * 成績(S2/S3 の reviewLabels)＋成功指標(S4)から「公開後判定」の候補メモを作る。
 * I/O は持たない(Notion 読み書き・microCMS・LINE は review-due-cli.ts)。
 * 承認画面は Notion を読むだけ(プル型)。実体の判定(公開後判定 select)は人が決める。
 */

import type { ReviewLabel } from "./metricsReview";

export { daysSincePublished } from "./metricsReview";

/** レビューのマイルストーン(公開からの日数)。S4 の 28/56/90日判定日 プロパティに対応。 */
export const REVIEW_MILESTONES = [28, 56, 90] as const;
export type ReviewMilestone = (typeof REVIEW_MILESTONES)[number];

/** 各マイルストーンの「判定日」プロパティ名(記録済み判定にも、記録の書き込みにも使う)。 */
export const REVIEW_DATE_PROPS: Record<ReviewMilestone, string> = {
  28: "28日判定日",
  56: "56日判定日",
  90: "90日判定日",
};

/** 候補を書くプロパティ名(公開後判定 select は人が決めるので、ここには書かない)。 */
export const REVIEW_MEMO_PROP = "判定メモ";

/**
 * 到来済み(daysSince >= マイルストーン)で、まだ記録していない最大のマイルストーンを返す。
 * 無ければ null。公開日不明(null)も null。週次実行で1回だけ各マイルストーンを拾うため、
 * `done` は各判定日プロパティが既に入っているか。
 */
export function selectReviewMilestone(
  daysSince: number | null,
  done: Record<ReviewMilestone, boolean>
): ReviewMilestone | null {
  if (daysSince === null) return null;
  let pick: ReviewMilestone | null = null;
  for (const m of REVIEW_MILESTONES) {
    if (daysSince >= m && !done[m]) pick = m;
  }
  return pick;
}

/** 判定メモの候補文を作る(マイルストーン＋判定ラベル＋成功指標)。公開後判定 select は人が決める。 */
export function buildReviewMemo(
  milestone: ReviewMilestone,
  labels: readonly ReviewLabel[],
  successMetric: string
): string {
  const labelPart = labels.length > 0 ? labels.join("・") : "判定材料が少ない";
  const goalPart = successMetric ? ` ／成功指標: ${successMetric}` : "";
  return `[${milestone}日レビュー] ${labelPart}${goalPart}`;
}
