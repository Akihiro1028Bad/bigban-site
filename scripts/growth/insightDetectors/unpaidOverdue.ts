/** D10: 利用済みで15日以上入金待ちの未収金を通知する。 */
import { jstYmdOfIso } from "../reservationAggregates";
import type { Detector } from "../insightEngine";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(referenceYmd: string, bookedAt: string): number {
  return Math.round((Date.parse(`${referenceYmd}T00:00:00Z`) - Date.parse(`${jstYmdOfIso(bookedAt)}T00:00:00Z`)) / DAY_MS);
}

export const unpaidOverdue: Detector = (context) => {
  const overdue = context.bundle.reservations.filter((reservation) => reservation.status !== "cancelled" && reservation.paymentStatus === "入金待ち" && reservation.useDate <= context.todayYmd && daysSince(context.todayYmd, reservation.bookedAt) >= 15);
  if (overdue.length === 0) return [];
  const amount = overdue.reduce((sum, reservation) => sum + (reservation.amount ?? 0), 0);
  return [{ id: "d10:unpaid", detector: "D10", severity: "notice", title: "未収金の滞留", body: `15日以上の入金待ちが${overdue.length}件、合計¥${amount.toLocaleString("ja-JP")}です。`, evidence: { count: overdue.length, amount, reservationIds: overdue.map((reservation) => reservation.reservationId) }, label: "有意" }];
};
