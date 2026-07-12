/**
 * AI講評の観点別スコア(各0-5)の平均を0-100へ写像する（総評リング表示用）。
 * backend Advice に総評数値が無いため、観点平均×20で決定的に導出する。
 * 空配列は0（講評未取得/観点なしの安全既定）。
 */
export function overallFromScores(scores: readonly { score: number }[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s.score, 0);
  return Math.round((sum / scores.length) * 20);
}
