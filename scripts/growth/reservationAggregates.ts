/** 正準予約データセットから経営ボード用のコア集計を作る純ロジック。 */
import { quantile, wilsonIntervalPositive } from "./reservationStats";
import type { CanonicalBundle, CanonicalReservation } from "./labolaNormalize";
import type { DateRange } from "./period";

const DAY_MS = 24 * 60 * 60 * 1000;
const SELF_CHANNELS = new Set<CanonicalReservation["channel"]>(["user_sp", "user_pc"]);
const SLOTS = ["6-9", "9-12", "12-15", "15-18", "18-21", "21-23"] as const;

type Slot = (typeof SLOTS)[number];

function dateOfYmd(ymd: string): Date {
  const date = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`日付を解釈できません: ${ymd}`);
  return date;
}

function addDays(ymd: string, days: number): string {
  return new Date(dateOfYmd(ymd).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function isWithin(ymd: string, range: DateRange): boolean {
  return ymd >= range.start && ymd <= range.end;
}

function recent28Range(referenceYmd: string): DateRange {
  return { start: addDays(referenceYmd, -27), end: referenceYmd };
}

export function jstYmdOfIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`日時を解釈できません: ${iso}`);
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function confirmedReservations(bundle: CanonicalBundle): CanonicalReservation[] {
  return bundle.reservations.filter((reservation) => reservation.status !== "cancelled");
}

function countBookedIn(reservations: readonly CanonicalReservation[], range: DateRange): number {
  return reservations.filter((reservation) => isWithin(jstYmdOfIso(reservation.bookedAt), range)).length;
}

function salesInRange(bundle: CanonicalBundle, range: DateRange, isForecast: boolean): number | null {
  const rows = bundle.salesDaily.filter((row) => row.isForecast === isForecast && isWithin(row.date, range));
  return rows.length === 0 ? null : rows.reduce((sum, row) => sum + row.total, 0);
}

/**
 * current.end を含む過去28日をセルフ予約の窓とする。
 * current/prior の週比較とは独立し、窓は current.end を基準に固定する。
 */
export function weeklyKpis(bundle: CanonicalBundle, current: DateRange, prior: DateRange, referenceYmd: string): {
  actual: { currentWeek: number; priorWeek: number; cumulative: number };
  self: { selfCount4w: number; total4w: number; smartphone4w: number; unknown4w: number };
  sales: { currentWeek: number | null; priorWeek: number | null; forecast28: number | null };
} {
  const confirmed = confirmedReservations(bundle);
  const selfRange = recent28Range(current.end);
  const recent = confirmed.filter((reservation) => isWithin(jstYmdOfIso(reservation.bookedAt), selfRange));
  const forecastRange = { start: referenceYmd, end: addDays(referenceYmd, 27) };
  return {
    actual: { currentWeek: countBookedIn(confirmed, current), priorWeek: countBookedIn(confirmed, prior), cumulative: confirmed.length },
    self: { selfCount4w: recent.filter((reservation) => SELF_CHANNELS.has(reservation.channel)).length, total4w: recent.length, smartphone4w: recent.filter((reservation) => reservation.channel === "user_sp").length, unknown4w: recent.filter((reservation) => reservation.channel === "unknown").length },
    sales: { currentWeek: salesInRange(bundle, current, false), priorWeek: salesInRange(bundle, prior, false), forecast28: salesInRange(bundle, forecastRange, true) },
  };
}

function mondayOf(ymd: string): string {
  const date = dateOfYmd(ymd);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(ymd, -offset);
}

function completedWeekEndingAt(coverageEnd: string): string {
  const weekStart = mondayOf(coverageEnd);
  // 日曜まで収録済みの週だけを系列へ出す。途中週を0件で確定させない。
  return addDays(weekStart, 6) <= coverageEnd ? weekStart : addDays(weekStart, -7);
}

function countsByWeek(reservations: readonly CanonicalReservation[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const reservation of reservations) {
    const weekStart = mondayOf(jstYmdOfIso(reservation.bookedAt));
    counts.set(weekStart, (counts.get(weekStart) ?? 0) + 1);
  }
  return counts;
}

export function weeklyReservationSeries(bundle: CanonicalBundle): { weekStart: string; count: number }[] {
  const counts = countsByWeek(confirmedReservations(bundle));
  const result: { weekStart: string; count: number }[] = [];
  const start = mondayOf(bundle.meta.coverage.start);
  // coverage.end まで完了した週だけ。同期日時/実行日を終端に使うと未収録週を0件化する。
  const end = completedWeekEndingAt(bundle.meta.coverage.end);
  if (end < start) return [];
  for (let week = start; week <= end; week = addDays(week, 7)) result.push({ weekStart: week, count: counts.get(week) ?? 0 });
  return result;
}

function minutesOf(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
}

function slotBounds(slot: Slot): [number, number] {
  const [start, end] = slot.split("-").map(Number);
  return [start * 60, end * 60];
}

function dowOf(ymd: string): number {
  return (dateOfYmd(ymd).getUTCDay() + 6) % 7;
}

function emptyHeatmap(): { dow: number; slot: Slot; count: number }[] {
  return Array.from({ length: 7 }, (_, dow) => SLOTS.map((slot) => ({ dow, slot, count: 0 }))).flat();
}

export function demandHeatmap(bundle: CanonicalBundle, referenceYmd: string): { dow: number; slot: string; count: number }[] {
  const cells = emptyHeatmap();
  const range = recent28Range(referenceYmd);
  for (const reservation of confirmedReservations(bundle)) {
    if (!isWithin(reservation.useDate, range)) continue;
    const start = minutesOf(reservation.start); const end = minutesOf(reservation.end);
    if (start === null || end === null || end < 6 * 60 || start > 23 * 60) continue;
    for (const cell of cells) {
      const [slotStart, slotEnd] = slotBounds(cell.slot);
      if (cell.dow === dowOf(reservation.useDate) && start < slotEnd && end > slotStart) cell.count += 1;
    }
  }
  return cells;
}

function dayDifference(laterYmd: string, earlierYmd: string): number {
  return Math.round((dateOfYmd(laterYmd).getTime() - dateOfYmd(earlierYmd).getTime()) / DAY_MS);
}

export function leadTimeStats(bundle: CanonicalBundle, referenceYmd: string): { n: number; median: number; p25: number; p75: number } | null {
  const range = recent28Range(referenceYmd);
  const days = confirmedReservations(bundle).filter((reservation) => isWithin(jstYmdOfIso(reservation.bookedAt), range)).map((reservation) => dayDifference(reservation.useDate, jstYmdOfIso(reservation.bookedAt))).sort((a, b) => a - b);
  const median = quantile(days, 0.5); const p25 = quantile(days, 0.25); const p75 = quantile(days, 0.75);
  return median === null || p25 === null || p75 === null ? null : { n: days.length, median, p25, p75 };
}

function increment(counts: Map<string, number>, ward: string): void {
  counts.set(ward, (counts.get(ward) ?? 0) + 1);
}

/** 予約数・顧客数の降順。同値時は文字列比較(コードポイント)順、「不明」は末尾。 */
export function wardCounts(bundle: CanonicalBundle): { ward: string; customers: number; reservations: number }[] {
  const customers = new Map<string, number>(); const reservations = new Map<string, number>();
  for (const customer of bundle.customers) increment(customers, customer.ward);
  for (const reservation of confirmedReservations(bundle)) increment(reservations, reservation.ward);
  const wards = new Set([...customers.keys(), ...reservations.keys()]);
  return [...wards].map((ward) => ({ ward, customers: customers.get(ward) ?? 0, reservations: reservations.get(ward) ?? 0 })).sort((left, right) => {
    if (left.ward === "不明") return 1;
    if (right.ward === "不明") return -1;
    return right.reservations - left.reservations || right.customers - left.customers || left.ward.localeCompare(right.ward, "ja");
  });
}

export function cancellationStats(bundle: CanonicalBundle, referenceYmd: string): { n: number; cancelled: number; rate: number; ciLow: number; ciHigh: number } | null {
  const range = recent28Range(referenceYmd);
  const reservations = bundle.reservations.filter((reservation) => isWithin(jstYmdOfIso(reservation.bookedAt), range));
  if (reservations.length === 0) return null;
  const cancelled = reservations.filter((reservation) => reservation.status === "cancelled").length;
  const interval = wilsonIntervalPositive(cancelled, reservations.length);
  return { n: reservations.length, cancelled, rate: cancelled / reservations.length, ciLow: interval.low, ciHigh: interval.high };
}
