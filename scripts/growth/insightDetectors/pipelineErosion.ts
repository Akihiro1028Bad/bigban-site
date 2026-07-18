/** D9: 見込み売上の急減を観察する。 */
import type { Detector } from "../insightEngine";

const MAX_REFERENCE_GAP_DAYS = 7;
const FORECAST_RATIO = 0.7;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayDifference(later: string, earlier: string): number { return Math.round((new Date(`${later}T00:00:00Z`).getTime() - new Date(`${earlier}T00:00:00Z`).getTime()) / DAY_MS); }

export const pipelineErosion: Detector = (context) => {
  const previous = context.previousSnapshot?.kpi.sales.forecast28;
  const current = context.kpi?.sales.forecast28;
  const reference = context.previousSnapshot?.analysis.referenceYmd;
  if (previous === null || previous === undefined || previous <= 0 || current === null || current === undefined || reference === undefined || Math.abs(dayDifference(context.todayYmd, reference)) > MAX_REFERENCE_GAP_DAYS || current >= previous * FORECAST_RATIO) return [];
  const dropPct = Math.round((1 - current / previous) * 1000) / 10;
  return [{ id: "d9:erosion", detector: "D9", severity: "notice", title: "見込み売上の毀損", body: "直近の見込み売上が前回から大きく減少しています", evidence: { current, previous, dropPct }, label: "観察" }];
};
