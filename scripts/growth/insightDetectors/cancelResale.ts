/** D13: キャンセル枠の再販成立を観察する。 */
import { cancelResaleStats } from "../reservationAggregates";
import type { Detector } from "../insightEngine";

export const cancelResale: Detector = (context) => {
  const stats = cancelResaleStats(context.bundle, context.todayYmd, context.current);
  if (stats.resold === 0 || stats.medianHours === null) return [];
  return [{ id: `d13:resold:${context.current.start}`, detector: "D13", severity: "info", title: "キャンセル枠の再販", body: `今週、キャンセル枠が${stats.resold}件再販されました`, evidence: { n: stats.resold, medianHours: stats.medianHours }, label: "観察" }];
};
