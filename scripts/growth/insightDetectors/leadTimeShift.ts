/** D4: 予約受付から利用日までの日数の変化を検出する。 */
import { jstYmdOfIso } from "../reservationAggregates";
import type { Detector } from "../insightEngine";

const WINDOW_DAYS = 28;
const MIN_SAMPLES = 8;
const MIN_SHIFT_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(ymd: string, days: number): string {
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2 : sorted[middle] as number;
}

function leadDays(useDate: string, bookedAt: string): number | null {
  const difference = (new Date(`${useDate}T00:00:00Z`).getTime() - new Date(`${jstYmdOfIso(bookedAt)}T00:00:00Z`).getTime()) / DAY_MS;
  // 遅延入力などの負値を当日予約として混入させず、中央値と標本数の両方から除外する。
  return difference < 0 ? null : Math.round(difference);
}

function valuesInWindow(context: Parameters<Detector>[0], start: string, end: string): number[] {
  return context.bundle.reservations
    .filter((reservation) => reservation.status === "confirmed" && jstYmdOfIso(reservation.bookedAt) >= start && jstYmdOfIso(reservation.bookedAt) <= end)
    .map((reservation) => leadDays(reservation.useDate, reservation.bookedAt))
    .filter((value): value is number => value !== null);
}

export const leadTimeShift: Detector = (context) => {
  const currentEnd = context.todayYmd;
  const currentStart = addDays(currentEnd, -(WINDOW_DAYS - 1));
  const priorEnd = addDays(currentStart, -1);
  const priorStart = addDays(priorEnd, -(WINDOW_DAYS - 1));
  const current = valuesInWindow(context, currentStart, currentEnd);
  const prior = valuesInWindow(context, priorStart, priorEnd);
  if (current.length < MIN_SAMPLES || prior.length < MIN_SAMPLES) return [];
  const currentMedian = median(current);
  const baselineMedian = median(prior);
  const mad = median(prior.map((value) => Math.abs(value - baselineMedian)));
  if (Math.abs(currentMedian - baselineMedian) <= Math.max(MIN_SHIFT_DAYS, mad)) return [];
  return [{ id: "d4:leadtime", detector: "D4", severity: "notice", title: "予約リードタイムの変化", body: currentMedian > baselineMedian ? "予約が前倒し傾向です" : "直前予約が増えています", evidence: { n: current.length, median: currentMedian, baselineMedian, mad }, label: "観察" }];
};
