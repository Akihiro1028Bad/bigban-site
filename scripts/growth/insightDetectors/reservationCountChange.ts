/** D2: 前4週平均からの週次予約数の急変を検出する。 */
import { poissonLowerTailP, poissonUpperTailP } from "../reservationStats";
import { weeklyReservationSeries } from "../reservationAggregates";
import type { Detector } from "../insightEngine";

function severityOf(observed: number, mean: number, p: number): { severity: "info" | "notice"; label: "観察" | "有意" } | null {
  if (p < 0.05) return { severity: "notice", label: observed < 10 ? "観察" : "有意" };
  if (observed >= 2 * mean || (mean >= 1 && observed <= mean / 2)) return { severity: "info", label: "観察" };
  return null;
}

export const reservationCountChange: Detector = (context) => {
  const series = weeklyReservationSeries(context.bundle);
  const index = series.findIndex((entry) => entry.weekStart === context.current.start);
  if (index < 4) return [];
  const observed = series[index].count;
  const baseline = series.slice(index - 4, index).map((entry) => entry.count);
  const mean = baseline.reduce((sum, count) => sum + count, 0) / baseline.length;
  const p = observed >= mean ? poissonUpperTailP(observed, mean) : poissonLowerTailP(observed, mean);
  const result = severityOf(observed, mean, p);
  if (result === null) return [];
  return [{ id: `d2:weekly:${context.current.start}`, detector: "D2", severity: result.severity, title: "週次予約数の変化", body: `今週の予約数は${observed}件です。`, evidence: { n: observed, observed, baselineMean: mean, p }, label: result.label }];
};
