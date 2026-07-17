/** D3: 直近28日とその前28日のセルフ予約率の変化を検出する。 */
import { jstYmdOfIso } from "../reservationAggregates";
import { wilsonInterval } from "../reservationStats";
import type { Detector } from "../insightEngine";
import type { DateRange } from "../period";

function addDays(ymd: string, days: number): string {
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}

function windowEnding(end: string): DateRange { return { start: addDays(end, -27), end }; }
function countSelf(context: Parameters<Detector>[0], range: DateRange): { self: number; total: number } {
  const reservations = context.bundle.reservations.filter((reservation) => reservation.status !== "cancelled" && jstYmdOfIso(reservation.bookedAt) >= range.start && jstYmdOfIso(reservation.bookedAt) <= range.end);
  return { self: reservations.filter((reservation) => reservation.channel === "user_sp" || reservation.channel === "user_pc").length, total: reservations.length };
}

export const selfRateChange: Detector = (context) => {
  const priorWindow = windowEnding(addDays(context.current.end, -28));
  const currentWindow = windowEnding(context.current.end);
  if (context.bundle.meta.coverage.start > priorWindow.start || context.bundle.meta.coverage.end < currentWindow.end) return [];
  const current = countSelf(context, currentWindow);
  const priorEnd = addDays(context.current.end, -28);
  const prior = countSelf(context, priorWindow);
  if (current.total < 10 || prior.total < 10) return [];
  const currentCi = wilsonInterval(current.self, current.total); const priorCi = wilsonInterval(prior.self, prior.total);
  if (currentCi === null || priorCi === null || !(currentCi.low > priorCi.high || priorCi.low > currentCi.high)) return [];
  return [{ id: `d3:selfRate:${context.current.start}`, detector: "D3", severity: "notice", title: "セルフ予約率の変化", body: "セルフ予約率に統計的な差が見られます。", evidence: { n: current.total, currentRate: current.self / current.total, priorRate: prior.self / prior.total, currentCi, priorCi }, label: "有意" }];
};
