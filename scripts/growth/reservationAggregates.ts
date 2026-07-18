/** 正準予約データセットから経営ボード用のコア集計を作る純ロジック。 */
import { quantile, wilsonIntervalPositive } from "./reservationStats";
import type { CanonicalBundle, CanonicalProgram, CanonicalReservation } from "./labolaNormalize";
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

function clippedRecent28Range(bundle: CanonicalBundle, referenceYmd: string): DateRange | null {
  const recent = recent28Range(referenceYmd);
  const start = recent.start > bundle.meta.coverage.start ? recent.start : bundle.meta.coverage.start;
  const end = recent.end < bundle.meta.coverage.end ? recent.end : bundle.meta.coverage.end;
  return start <= end ? { start, end } : null;
}

export function jstYmdOfIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`日時を解釈できません: ${iso}`);
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 指定週に受付されたセルフ予約を数える。
 * GA4の完了イベントは予約時点で発火するため、後日取消された予約も比較対象に含める。
 */
export function selfBookedInWeek(reservations: CanonicalReservation[], week: { start: string; end: string }): number {
  return reservations.filter((reservation) => SELF_CHANNELS.has(reservation.channel) && isWithin(jstYmdOfIso(reservation.bookedAt), week)).length;
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

const ON_THE_BOOKS_DAYS_OUT = [7, 14, 21, 28] as const;

/** 基準日の翌日から各観測点までに確定している予約と見込み売上を集計する。 */
export function onTheBooksPoints(bundle: CanonicalBundle, referenceYmd: string): { daysOut: number; reservations: number; forecastSales: number | null }[] {
  return ON_THE_BOOKS_DAYS_OUT.map((daysOut) => {
    const range = { start: addDays(referenceYmd, 1), end: addDays(referenceYmd, daysOut) };
    const reservations = confirmedReservations(bundle).filter((reservation) => isWithin(reservation.useDate, range)).length;
    // 売上CSVが欠落している場合は、見込み0と区別してnullにする。
    const forecastSales = bundle.salesDaily.length === 0 ? null : bundle.salesDaily.filter((row) => row.isForecast === true && isWithin(row.date, range)).reduce((sum, row) => sum + row.total, 0);
    return { daysOut, reservations, forecastSales };
  });
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

const SPACE_RESERVATION_CATEGORY = "スペース予約";

/** プログラム参加予約は、プログラム名・開催日・開始時刻で予約CSVと突合する。 */
export function programParticipationReservations(bundle: CanonicalBundle, program: CanonicalProgram): CanonicalReservation[] {
  return confirmedReservations(bundle).filter((reservation) => reservation.category !== SPACE_RESERVATION_CATEGORY && reservation.space === program.name && reservation.useDate === program.heldOn && reservation.start === program.start);
}

export function programFills(bundle: CanonicalBundle, referenceYmd: string): { name: string; heldOn: string; start: string; capacity: number | null; reserved: number; fillRate: number | null }[] {
  const range = { start: addDays(referenceYmd, -27), end: addDays(referenceYmd, 28) };
  return bundle.programs
    .filter((program) => isWithin(program.heldOn, range) && program.publishStatus !== "非公開")
    .map((program) => {
      const reserved = programParticipationReservations(bundle, program).length;
      return { name: program.name, heldOn: program.heldOn, start: program.start, capacity: program.capacity, reserved, fillRate: program.capacity === null || program.capacity === 0 ? null : reserved / program.capacity };
    }).sort((left, right) => left.heldOn.localeCompare(right.heldOn) || left.start.localeCompare(right.start));
}

type AgingBucket = { label: "0-7日" | "8-14日" | "15日以上"; count: number; amount: number };

/** 利用済みで未払いの未収金を集計する。処理待ちは決済処理中のため未収金に含めない。 */
export function unpaidAging(bundle: CanonicalBundle, referenceYmd: string): { count: number; amount: number; buckets: AgingBucket[] } | null {
  if (bundle.reservations.length === 0) return null;
  const buckets: AgingBucket[] = [{ label: "0-7日", count: 0, amount: 0 }, { label: "8-14日", count: 0, amount: 0 }, { label: "15日以上", count: 0, amount: 0 }];
  for (const reservation of confirmedReservations(bundle)) {
    if (reservation.paymentStatus !== "未払い" || reservation.useDate > referenceYmd) continue;
    const days = dayDifference(referenceYmd, jstYmdOfIso(reservation.bookedAt));
    const bucket = days <= 7 ? buckets[0] : days <= 14 ? buckets[1] : buckets[2];
    bucket.count += 1;
    bucket.amount += reservation.amount ?? 0;
  }
  return { count: buckets.reduce((sum, bucket) => sum + bucket.count, 0), amount: buckets.reduce((sum, bucket) => sum + bucket.amount, 0), buckets };
}

export function paymentMethodShare(bundle: CanonicalBundle, referenceYmd: string): { method: string; count: number }[] {
  const range = recent28Range(referenceYmd);
  const counts = new Map<string, number>();
  for (const reservation of confirmedReservations(bundle)) {
    if (!isWithin(jstYmdOfIso(reservation.bookedAt), range)) continue;
    const method = reservation.paymentMethod || "不明";
    counts.set(method, (counts.get(method) ?? 0) + 1);
  }
  return [...counts].map(([method, count]) => ({ method, count })).sort((left, right) => right.count - left.count || left.method.localeCompare(right.method, "ja"));
}

export function demographics(bundle: CanonicalBundle): { ageBand: string; gender: string; customerType: string; count: number }[] {
  const counts = new Map<string, { ageBand: string; gender: string; customerType: string; count: number }>();
  for (const customer of bundle.customers) {
    const key = `${customer.ageBand}\u0000${customer.gender}\u0000${customer.customerType}`;
    const current = counts.get(key) ?? { ageBand: customer.ageBand, gender: customer.gender, customerType: customer.customerType, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.ageBand.localeCompare(right.ageBand, "ja"));
}

function overlapMinutes(start: string, end: string, lower: number, upper: number): number {
  const startMinutes = minutesOf(start); const endMinutes = minutesOf(end);
  if (startMinutes === null || endMinutes === null) return 0;
  return Math.max(0, Math.min(endMinutes, upper) - Math.max(startMinutes, lower));
}

export function revPach(bundle: CanonicalBundle, referenceYmd: string): { revenue: number; availableCourtHours: number; revPerCourtHour: number; spaces: number } | null {
  const range = clippedRecent28Range(bundle, referenceYmd);
  if (range === null) return null;
  const spaces = new Set<string>();
  for (const reservation of bundle.reservations) if (reservation.category === SPACE_RESERVATION_CATEGORY && reservation.space !== "None") spaces.add(reservation.space);
  for (const blocked of bundle.blockedSlots) if (blocked.space !== "None") spaces.add(blocked.space);
  if (spaces.size === 0) return null;
  let days = 0;
  for (let day = range.start; day <= range.end; day = addDays(day, 1)) days += 1;
  const blockedMinutes = bundle.blockedSlots.filter((slot) => spaces.has(slot.space) && isWithin(slot.date, range)).reduce((sum, slot) => sum + overlapMinutes(slot.start, slot.end, 6 * 60, 23 * 60), 0);
  const availableMinutes = spaces.size * days * 1020 - blockedMinutes;
  const revenue = confirmedReservations(bundle).filter((reservation) => reservation.category === SPACE_RESERVATION_CATEGORY && isWithin(reservation.useDate, range)).reduce((sum, reservation) => sum + (reservation.amount ?? 0), 0);
  const availableCourtHours = availableMinutes / 60;
  return { revenue, availableCourtHours, revPerCourtHour: availableCourtHours === 0 ? 0 : revenue / availableCourtHours, spaces: spaces.size };
}
