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

/** 予約CSV sidecar JSONを解析する。 */
export function parseReservationCoverageJson(input: string): ReservationCoverage {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new Error("予約CSV収録範囲sidecarがJSONではありません");
  }
  if (!value || typeof value !== "object") {
    throw new Error("予約CSV収録範囲sidecarにcoverageStartがありません");
  }
  const record = value as Record<string, unknown>;
  const start = record.coverageStart;
  const end = record.coverageEnd;
  if (typeof start !== "string") {
    throw new Error("予約CSV収録範囲sidecarにcoverageStartがありません");
  }
  if (typeof end !== "string") {
    throw new Error("予約CSV収録範囲sidecarにcoverageEndがありません");
  }
  if (!isValidYmd(start) || !isValidYmd(end)) {
    throw new Error("予約CSV収録範囲sidecarの日付が不正です");
  }
  if (start > end) throw new Error("予約CSV収録範囲sidecarの日付前後が逆です");
  return { start, end };
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

function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let isQuoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (isQuoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
    } else if (char === "," && !isQuoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !isQuoted) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (isQuoted) throw new Error("CSVの引用符が閉じていません");
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

export function parseReservationCsv(input: string): ParsedReservationCsv {
  const rows = csvRows(input);
  const headers = (rows[0] ?? []).map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim()
  );
  const required = ["reservation_id", "booked_at", "status"] as const;
  for (const name of required) {
    if (!headers.includes(name)) throw new Error(`必須列 ${name} がありません`);
  }
  const indexes = Object.fromEntries(headers.map((name, index) => [name, index])) as Record<
    string,
    number
  >;
  const hasSourcePagePath = headers.includes("source_page_path");
  const seen = new Set<string>();
  const records = rows.slice(1).map((values, rowIndex): ReservationRecord => {
    const reservationId = values[indexes.reservation_id] ?? "";
    const bookedAt = values[indexes.booked_at] ?? "";
    const status = values[indexes.status] ?? "";
    if (!reservationId) throw new Error(`${rowIndex + 2}行目のreservation_idが空です`);
    if (seen.has(reservationId)) throw new Error(`reservation_idが重複しています: ${reservationId}`);
    seen.add(reservationId);
    if (Number.isNaN(Date.parse(bookedAt))) throw new Error(`${rowIndex + 2}行目の日時が不正です`);
    if (status !== "confirmed" && status !== "completed" && status !== "cancelled") {
      throw new Error(`${rowIndex + 2}行目のstatusが不正です: ${status}`);
    }
    const sourcePagePath = hasSourcePagePath
      ? (values[indexes.source_page_path] ?? "").trim()
      : undefined;
    return {
      reservationId,
      bookedAt,
      status,
      ...(sourcePagePath !== undefined ? { sourcePagePath } : {}),
    };
  });
  return { records, hasSourcePagePath };
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
