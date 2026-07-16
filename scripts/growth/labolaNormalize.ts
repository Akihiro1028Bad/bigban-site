/** ラボーラ行をPIIを含まない正準データセットへ変換する純ロジック。 */
import { ageBand, extractWard, occupationGroup, pseudoId } from "./piiBoundary";
import { jstYmdOfIso } from "./reservationAggregates";
import { coverageSchema, isoDateTimeSchema } from "./dateSchemas";
import { isExcluded } from "./reservationExclusions";
import type { ExclusionRules } from "./reservationExclusions";
import type { CustomerRow, SalesSummaryRow, YoyakuRow } from "./labolaSchemas";

export interface CanonicalReservation {
  reservationId: string; bookedAt: string; useDate: string; start: string; end: string;
  category: string; space: string; status: "confirmed" | "cancelled"; acceptStatus: string;
  paymentStatus: string; paymentMethod: string; plan: string; amount: number | null;
  partySize: number | null; channel: "user_sp" | "user_pc" | "admin" | "unknown";
  customerType: string; pseudoId: string | null; ward: string; ageBand: string;
  gender: string; occupationGroup: string; hasRemarks: boolean;
}

export interface CanonicalCustomer {
  pseudoId: string | null; registeredAt: string; customerType: string; ward: string;
  ageBand: string; gender: string; occupationGroup: string;
}

export interface RemarkEntry { reservationId: string; useDate: string; category: string; remarks: string; }
export interface CanonicalMeta {
  schemaVersion: 1; generatedAt: string; coverage: { start: string; end: string };
  counts: Record<string, number>; excludedCount: number; missingSections: string[]; warnings: string[];
}
export interface CanonicalBundle {
  reservations: CanonicalReservation[]; customers: CanonicalCustomer[]; salesDaily: SalesSummaryRow[];
  remarks: RemarkEntry[]; meta: CanonicalMeta;
}

function canonicalReservation(row: YoyakuRow, hashKey: string, onYmd: string): CanonicalReservation {
  return { reservationId: row.reservationId, bookedAt: row.bookedAt, useDate: row.useDate, start: row.start, end: row.end, category: row.category, space: row.space, status: row.status, acceptStatus: row.acceptStatus, paymentStatus: row.paymentStatus, paymentMethod: row.paymentMethod, plan: row.plan, amount: row.amount, partySize: row.partySize, channel: row.channel, customerType: row.customerType, pseudoId: pseudoId(row.email, row.memberNo, hashKey), ward: extractWard(row.address), ageBand: ageBand(row.birthDate, onYmd), gender: row.gender, occupationGroup: occupationGroup(row.occupation), hasRemarks: row.remarks !== "" };
}

function canonicalCustomer(row: CustomerRow, hashKey: string, onYmd: string): CanonicalCustomer {
  return { pseudoId: pseudoId(row.email, row.memberNo, hashKey), registeredAt: row.registeredAt, customerType: row.customerType, ward: extractWard(row.address), ageBand: ageBand(row.birthDate, onYmd), gender: row.gender, occupationGroup: occupationGroup(row.occupation) };
}

export function buildCanonical(input: { yoyaku: YoyakuRow[]; customers: CustomerRow[] | null; salesSummary: SalesSummaryRow[] | null; rules: ExclusionRules; hashKey: string; coverageStart: string; generatedAt: string; parseWarnings: string[] }): CanonicalBundle {
  if (!coverageSchema.safeParse({ start: input.coverageStart, end: input.coverageStart }).success) throw new Error("収録範囲の開始日が不正です");
  if (!isoDateTimeSchema.safeParse(input.generatedAt).success) throw new Error("生成日時が不正です");
  let excludedCount = 0;
  const seen = new Set<string>();
  const reservations: CanonicalReservation[] = [];
  const remarks: RemarkEntry[] = [];
  const onYmd = jstYmdOfIso(input.generatedAt);
  for (const row of input.yoyaku) {
    if (seen.has(row.reservationId)) throw new Error("予約番号が重複しています");
    seen.add(row.reservationId);
    if (isExcluded(row, input.rules)) { excludedCount += 1; continue; }
    if (row.remarks) remarks.push({ reservationId: row.reservationId, useDate: row.useDate, category: row.category, remarks: row.remarks });
    reservations.push(canonicalReservation(row, input.hashKey, onYmd));
  }
  const missingSections: string[] = [];
  const customers: CanonicalCustomer[] = [];
  if (input.customers === null) missingSections.push("customer");
  else for (const row of input.customers) {
    if (isExcluded(row, input.rules)) { excludedCount += 1; continue; }
    customers.push(canonicalCustomer(row, input.hashKey, onYmd));
  }
  if (input.salesSummary === null) missingSections.push("salesSummary");
  const salesDaily = input.salesSummary ?? [];
  const warnings = [...input.parseWarnings];
  const bookedDates = input.yoyaku.map((row) => jstYmdOfIso(row.bookedAt));
  if (bookedDates.some((date) => date < input.coverageStart || date > onYmd)) warnings.push("予約受付日時が収録範囲外です");
  if (!coverageSchema.safeParse({ start: input.coverageStart, end: onYmd }).success) throw new Error("収録範囲が不正です");
  return { reservations, customers, salesDaily, remarks, meta: { schemaVersion: 1, generatedAt: input.generatedAt, coverage: { start: input.coverageStart, end: onYmd }, counts: { yoyaku: reservations.length, customer: customers.length, salesSummary: salesDaily.length }, excludedCount, missingSections, warnings } };
}

export function serializeJsonl(records: readonly unknown[]): string { return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""); }
export function parseJsonl<T>(content: string, guard: (value: unknown) => T): T[] {
  return content.split("\n").filter((line) => line.trim() !== "").map((line, index) => { try { return guard(JSON.parse(line)); } catch { throw new Error(`JSONLの${index + 1}行目が不正です`); } });
}
