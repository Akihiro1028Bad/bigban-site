/** D12: 備考の新規問い合わせを本文を露出せずに通知する。 */
import { jstYmdOfIso } from "../reservationAggregates";
import type { Detector } from "../insightEngine";

export const newRemarks: Detector = (context) => {
  const bookedAtById = new Map(context.bundle.reservations.map((reservation) => [reservation.reservationId, reservation.bookedAt]));
  return context.bundle.remarks
    .filter((remark) => {
      const bookedAt = bookedAtById.get(remark.reservationId);
      const ymd = bookedAt ? jstYmdOfIso(bookedAt) : null;
      return ymd !== null && ymd >= context.current.start && ymd <= context.current.end;
    })
    .map((remark) => ({ id: `d12:remark:${remark.reservationId}`, detector: "D12", severity: "info" as const, title: "新規の備考問い合わせ", body: `備考に新規の問い合わせがあります(予約番号${remark.reservationId})。remarks-review を確認してください。`, evidence: { n: 1, reservationId: remark.reservationId }, label: "観察" as const }));
};
