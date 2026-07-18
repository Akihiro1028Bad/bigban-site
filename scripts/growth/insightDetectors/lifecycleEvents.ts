/** D7: 予約履歴からリピートと会員転換を観察する。 */
import { jstYmdOfIso } from "../reservationAggregates";
import type { CanonicalReservation } from "../labolaNormalize";
import type { Detector } from "../insightEngine";

const MEMBER_TEXT = "会員";

function isMember(customerType: string): boolean {
  // 入力CSVの会員種別は固定列挙ではないため、運用上の共通文字列で判定する。
  return customerType.includes(MEMBER_TEXT);
}

function reservationsByCustomer(reservations: readonly CanonicalReservation[]): Map<string, CanonicalReservation[]> {
  const result = new Map<string, CanonicalReservation[]>();
  for (const reservation of reservations) {
    if (reservation.status !== "confirmed" || reservation.pseudoId === null) continue;
    const values = result.get(reservation.pseudoId) ?? [];
    values.push(reservation);
    result.set(reservation.pseudoId, values);
  }
  for (const values of result.values()) values.sort((left, right) => new Date(left.bookedAt).getTime() - new Date(right.bookedAt).getTime());
  return result;
}

export const lifecycleEvents: Detector = (context) => {
  const customers = reservationsByCustomer(context.bundle.reservations);
  const repeatCustomers = [...customers.values()].filter((reservations) => {
    const second = reservations[1];
    return second !== undefined && jstYmdOfIso(second.bookedAt) >= context.current.start && jstYmdOfIso(second.bookedAt) <= context.current.end;
  });
  const hadRepeatBeforeCurrent = [...customers.values()].some((reservations) => {
    const second = reservations[1];
    return second !== undefined && jstYmdOfIso(second.bookedAt) < context.current.start;
  });
  const insights = [] as ReturnType<Detector>;
  if (repeatCustomers.length > 0) insights.push(hadRepeatBeforeCurrent
    ? { id: `d7:repeats:${context.current.start}`, detector: "D7", severity: "info", title: "今週のリピート発生", body: `今週、${repeatCustomers.length}人が2回目の予約に至りました`, evidence: { n: repeatCustomers.length }, label: "観察" }
    : { id: "d7:first-repeat", detector: "D7", severity: "notice", title: "初のリピート発生", body: "施設で初めて2回目の予約が発生しました", evidence: { n: repeatCustomers.length }, label: "観察" });
  const conversions = [...customers.values()].filter((reservations) => {
    const past = reservations.filter((reservation) => jstYmdOfIso(reservation.bookedAt) < context.current.start);
    const current = reservations.filter((reservation) => jstYmdOfIso(reservation.bookedAt) >= context.current.start && jstYmdOfIso(reservation.bookedAt) <= context.current.end);
    return past.length > 0 && past.every((reservation) => !isMember(reservation.customerType)) && current.some((reservation) => isMember(reservation.customerType));
  });
  if (conversions.length > 0) insights.push({ id: `d7:conversion:${context.current.start}`, detector: "D7", severity: "info", title: "ビジターから会員への転換", body: `今週、${conversions.length}人が会員予約に転換しました`, evidence: { n: conversions.length }, label: "観察" });
  return insights;
};
