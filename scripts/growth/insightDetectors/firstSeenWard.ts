/** D1: 前回に無い市区町村からの初予約を検出する。 */
import { wardCounts } from "../reservationAggregates";
import type { Detector } from "../insightEngine";

export const firstSeenWard: Detector = (context) => {
  if (context.previousSnapshot === null) return [];
  const previous = new Set(context.previousSnapshot.catalog.wards.filter((entry) => entry.reservations >= 1).map((entry) => entry.ward));
  return wardCounts(context.bundle)
    .filter((entry) => entry.ward !== "不明" && entry.reservations >= 1 && !previous.has(entry.ward))
    .map((entry) => ({ id: `d1:ward:${entry.ward}`, detector: "D1", severity: "notice" as const, title: `新規商圏: ${entry.ward}`, body: `${entry.ward}からの初予約を検出しました。`, evidence: { n: entry.reservations, customers: entry.customers }, label: "観察" as const }));
};
