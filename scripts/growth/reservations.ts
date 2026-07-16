/** ベンダー非依存の正規化予約CSVを扱う純ロジック。I/Oはmetrics-cli側に限定する。 */

import { metricDelta } from "./ctaEvents";
import { normalizePagePath, type ActualReservationMetrics, type MetricDelta } from "./metrics";
import type { DateRange } from "./period";

export type ReservationStatus = "confirmed" | "completed" | "cancelled";

export interface ReservationRecord {
  reservationId: string;
  bookedAt: string;
  status: ReservationStatus;
  sourcePagePath?: string;
}

export interface ParsedReservationCsv {
  records: ReservationRecord[];
  hasSourcePagePath: boolean;
}

export interface ReservationCoverage {
  start: string;
  end: string;
}

function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseCanonicalMeta(json: string): { generatedAt: string; coverage: ReservationCoverage } {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error("正準メタデータがJSONではありません"); }
  if (!value || typeof value !== "object") throw new Error("正準メタデータの形式が不正です");
  const record = value as Record<string, unknown>; const coverage = record.coverage;
  if (typeof record.generatedAt !== "string" || Number.isNaN(Date.parse(record.generatedAt))) throw new Error("正準メタデータのgeneratedAtが不正です");
  if (!coverage || typeof coverage !== "object") throw new Error("正準メタデータのcoverageがありません");
  const range = coverage as Record<string, unknown>;
  if (typeof range.start !== "string" || typeof range.end !== "string" || !isValidYmd(range.start) || !isValidYmd(range.end)) throw new Error("正準メタデータのcoverage日付が不正です");
  if (range.start > range.end) throw new Error("正準メタデータのcoverage日付前後が逆です");
  return { generatedAt: record.generatedAt, coverage: { start: range.start, end: range.end } };
}

export function reservationCoverageForPeriods(
  coverage: ReservationCoverage,
  current: DateRange,
  prior: DateRange
): { current: boolean; prior: boolean } {
  const covers = (range: DateRange) =>
    coverage.start <= range.start && coverage.end >= range.end;
  return { current: covers(current), prior: covers(prior) };
}

export function parseCanonicalReservationsJsonl(content: string): ParsedReservationCsv {
  const seen = new Set<string>();
  const records = content.split("\n").filter((line) => line.trim() !== "").map((line, index): ReservationRecord => {
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new Error(`${index + 1}行目のJSONが不正です`); }
    if (!value || typeof value !== "object") throw new Error(`${index + 1}行目の形式が不正です`);
    const record = value as Record<string, unknown>; const reservationId = record.reservationId; const bookedAt = record.bookedAt; const status = record.status;
    if (typeof reservationId !== "string" || reservationId === "") throw new Error(`${index + 1}行目のreservationIdが空です`);
    if (seen.has(reservationId)) throw new Error(`reservationIdが重複しています: ${reservationId}`);
    seen.add(reservationId);
    if (typeof bookedAt !== "string" || Number.isNaN(Date.parse(bookedAt))) throw new Error(`${index + 1}行目の日時が不正です`);
    if (status !== "confirmed" && status !== "cancelled") throw new Error(`${index + 1}行目のstatusが不正です: ${String(status)}`);
    return { reservationId, bookedAt, status };
  });
  return { records, hasSourcePagePath: false };
}

function jstYmd(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function includesDate(range: DateRange, ymd: string): boolean {
  return ymd >= range.start && ymd <= range.end;
}

export function aggregateReservations(
  parsed: ParsedReservationCsv,
  current: DateRange,
  prior: DateRange,
  pagePath: string
): { facility: MetricDelta; article: MetricDelta | null } {
  let facilityCurrent = 0;
  let facilityPrior = 0;
  let articleCurrent = 0;
  let articlePrior = 0;
  const target = normalizePagePath(pagePath);
  for (const record of parsed.records) {
    if (record.status === "cancelled") continue;
    const ymd = jstYmd(record.bookedAt);
    const isCurrent = includesDate(current, ymd);
    const isPrior = includesDate(prior, ymd);
    if (isCurrent) facilityCurrent += 1;
    if (isPrior) facilityPrior += 1;
    if (
      parsed.hasSourcePagePath &&
      record.sourcePagePath &&
      normalizePagePath(record.sourcePagePath) === target
    ) {
      if (isCurrent) articleCurrent += 1;
      if (isPrior) articlePrior += 1;
    }
  }
  return {
    facility: metricDelta(facilityCurrent, facilityPrior),
    article: parsed.hasSourcePagePath ? metricDelta(articleCurrent, articlePrior) : null,
  };
}

interface ActualReservationsForPageInput {
  parsed: ParsedReservationCsv;
  coverage: ReservationCoverage;
  current: DateRange;
  prior: DateRange;
  pagePath: string;
  syncedAt: string;
  checkedAt: string;
}

/** 収録期間を検証してから記事の実予約deltaを作る。 */
export function actualReservationsForPage(
  input: ActualReservationsForPageInput
): ActualReservationMetrics {
  const covered = reservationCoverageForPeriods(input.coverage, input.current, input.prior);
  if (!covered.current || !covered.prior) {
    return {
      state: "missing",
      reason: "coverage_incomplete",
      checkedAt: input.checkedAt,
      coverage: { ...input.coverage, ...covered },
    };
  }
  return {
    state: "available",
    source: "csv",
    syncedAt: input.syncedAt,
    ...aggregateReservations(input.parsed, input.current, input.prior, input.pagePath),
  };
}

export function isReservationDataFresh(
  syncedAt: string,
  checkedAt: string,
  maxAgeDays = 7
): boolean {
  const synced = Date.parse(syncedAt);
  const checked = Date.parse(checkedAt);
  if (Number.isNaN(synced) || Number.isNaN(checked) || synced > checked) return false;
  return checked - synced <= maxAgeDays * 86_400_000;
}

type AvailableReservationMetrics = Extract<ActualReservationMetrics, { state: "available" }>;

export function selectLatestReservationSnapshot(
  snapshots: readonly ActualReservationMetrics[]
): AvailableReservationMetrics | null {
  return snapshots
    .filter((snapshot): snapshot is AvailableReservationMetrics => snapshot.state === "available")
    .sort((a, b) => Date.parse(b.syncedAt) - Date.parse(a.syncedAt))[0] ?? null;
}
