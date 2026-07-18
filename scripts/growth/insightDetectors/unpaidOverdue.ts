/** D10: 利用済みで15日以上未払いの未収金を通知する。処理待ちは決済処理中のため未収金に含めない。 */
import { jstYmdOfIso } from "../reservationAggregates";
import type { Detector } from "../insightEngine";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(referenceYmd: string, bookedAt: string): number {
  return Math.round((Date.parse(`${referenceYmd}T00:00:00Z`) - Date.parse(`${jstYmdOfIso(bookedAt)}T00:00:00Z`)) / DAY_MS);
}

export const unpaidOverdue: Detector = (context) => {
  const overdue = context.bundle.reservations.filter((reservation) => reservation.status !== "cancelled" && reservation.paymentStatus === "未払い" && reservation.useDate <= context.todayYmd && daysSince(context.todayYmd, reservation.bookedAt) >= 15);
  if (overdue.length === 0) return [];
  const amount = overdue.reduce((sum, reservation) => sum + (reservation.amount ?? 0), 0);
  // 閾値による運用上の観察であり統計検定を伴わないため、§9によりlabelは「観察」に固定する。
  return [{ id: "d10:unpaid", detector: "D10", severity: "notice", title: "未収金の滞留", body: `15日以上の未払いが${overdue.length}件、合計¥${amount.toLocaleString("ja-JP")}です。`, evidence: { count: overdue.length, amount, reservationIds: overdue.map((reservation) => reservation.reservationId) }, label: "観察" }];
};
