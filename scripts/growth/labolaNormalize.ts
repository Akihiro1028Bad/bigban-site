/** ラボーラ行をPIIを含まない正準データセットへ変換する純ロジック。 */
import { ageBand, extractWard, occupationGroup, pseudoId } from "./piiBoundary";
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

function jstYmdOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`生成日時を解釈できません: ${iso}`);
  return new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function canonicalReservation(row: YoyakuRow, hashKey: string, onYmd: string): CanonicalReservation {
  return { reservationId: row.reservationId, bookedAt: row.bookedAt, useDate: row.useDate, start: row.start, end: row.end, category: row.category, space: row.space, status: row.status, acceptStatus: row.acceptStatus, paymentStatus: row.paymentStatus, paymentMethod: row.paymentMethod, plan: row.plan, amount: row.amount, partySize: row.partySize, channel: row.channel, customerType: row.customerType, pseudoId: pseudoId(row.email, row.memberNo, hashKey), ward: extractWard(row.address), ageBand: ageBand(row.birthDate, onYmd), gender: row.gender, occupationGroup: occupationGroup(row.occupation), hasRemarks: row.remarks !== "" };
}

function canonicalCustomer(row: CustomerRow, hashKey: string, onYmd: string): CanonicalCustomer {
  return { pseudoId: pseudoId(row.email, row.memberNo, hashKey), registeredAt: row.registeredAt, customerType: row.customerType, ward: extractWard(row.address), ageBand: ageBand(row.birthDate, onYmd), gender: row.gender, occupationGroup: occupationGroup(row.occupation) };
}

export function buildCanonical(input: { yoyaku: YoyakuRow[]; customers: CustomerRow[] | null; salesSummary: SalesSummaryRow[] | null; rules: ExclusionRules; hashKey: string; coverageStart: string; generatedAt: string; parseWarnings: string[] }): CanonicalBundle {
  let excludedCount = 0;
  const seen = new Set<string>();
  const reservations: CanonicalReservation[] = [];
  const remarks: RemarkEntry[] = [];
  const onYmd = jstYmdOf(input.generatedAt);
  for (const row of input.yoyaku) {
    if (seen.has(row.reservationId)) throw new Error(`予約番号が重複しています: ${row.reservationId}`);
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
  return { reservations, customers, salesDaily, remarks, meta: { schemaVersion: 1, generatedAt: input.generatedAt, coverage: { start: input.coverageStart, end: onYmd }, counts: { yoyaku: reservations.length, customer: customers.length, salesSummary: salesDaily.length }, excludedCount, missingSections, warnings: input.parseWarnings } };
}

export function serializeJsonl(records: readonly unknown[]): string { return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""); }
export function parseJsonl<T>(content: string, guard: (value: unknown) => T): T[] {
  return content.split("\n").filter((line) => line.trim() !== "").map((line, index) => { try { return guard(JSON.parse(line)); } catch (error) { throw new Error(`JSONLの${index + 1}行目が不正です: ${String(error)}`); } });
}
