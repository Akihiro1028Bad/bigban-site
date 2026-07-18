/** D6: 28日先までの予約ペースが履歴中央値から外れたことを検出する。 */
import type { Detector } from "../insightEngine";

const DAYS_OUT = 28;
const MIN_BASELINE = 5;
const WEAK_RATIO = 0.5;
const STRONG_RATIO = 1.5;

export const paceDeviation: Detector = (context) => {
  const point = context.onTheBooks?.find((candidate) => candidate.daysOut === DAYS_OUT);
  const historyWeeks = (context.history ?? []).filter((snapshot) => snapshot.series.onTheBooks?.some((candidate) => candidate.daysOut === DAYS_OUT)).length;
  if (historyWeeks < 6) return [];
  if (point === undefined || point.baselineMedian === null || point.baselineMedian < MIN_BASELINE) return [];
  if (point.reservations < point.baselineMedian * WEAK_RATIO) return [{ id: "d6:weak", detector: "D6", severity: "notice", title: "ブッキングペースの逸脱", body: "今後28日の予約ペースが弱い", evidence: { n: point.reservations, baselineMedian: point.baselineMedian, historyWeeks }, label: "観察" }];
  if (point.reservations > point.baselineMedian * STRONG_RATIO) return [{ id: "d6:strong", detector: "D6", severity: "notice", title: "ブッキングペースの逸脱", body: "今後28日の予約ペースが強い", evidence: { n: point.reservations, baselineMedian: point.baselineMedian, historyWeeks }, label: "観察" }];
  return [];
};
