/** D8: 利用間隔から休眠リスクを観察する。 */
import { quantile } from "../reservationStats";
import type { CanonicalReservation } from "../labolaNormalize";
import type { Detector } from "../insightEngine";

const MIN_RESERVATIONS = 3;
const MIN_DORMANT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MEMBERS = 5;

function daysBetween(later: string, earlier: string): number { return Math.round((new Date(`${later}T00:00:00Z`).getTime() - new Date(`${earlier}T00:00:00Z`).getTime()) / DAY_MS); }

export const dormantRisk: Detector = (context) => {
  const customers = new Map<string, CanonicalReservation[]>();
  for (const reservation of context.bundle.reservations) {
    if (reservation.status !== "confirmed" || reservation.pseudoId === null) continue;
    const values = customers.get(reservation.pseudoId) ?? []; values.push(reservation); customers.set(reservation.pseudoId, values);
  }
  const matched = [...customers.entries()].flatMap(([pseudoId, reservations]) => {
    if (reservations.length < MIN_RESERVATIONS) return [];
    const dates = reservations.map((reservation) => reservation.useDate).sort();
    const gaps = dates.slice(1).map((date, index) => daysBetween(date, dates[index] as string));
    // 3回以上の予約が保証されるため gaps は2件以上・dates は空でなく、中央値と最終利用日は必ず得られる。
    const medianGap = quantile(gaps.sort((left, right) => left - right), 0.5) as number;
    const lastUse = dates.at(-1) as string;
    const elapsed = daysBetween(context.todayYmd, lastUse);
    return elapsed > Math.max(medianGap * 2, MIN_DORMANT_DAYS) ? [{ pseudoId, lastUse, medianGap, elapsed }] : [];
  });
  if (matched.length === 0) return [];
  const members = matched.sort((left, right) => right.elapsed - left.elapsed).slice(0, MAX_MEMBERS);
  // PII境界: evidenceへ載せる顧客識別子はpseudoId先頭8文字に限定する。
  return [{ id: `d8:dormant:${context.todayYmd}`, detector: "D8", severity: "info", title: "休眠リスク", body: `${matched.length}人に利用間隔を超えた未利用が見られます`, evidence: { n: matched.length, members: members.map((member) => ({ id: member.pseudoId.slice(0, 8), lastUse: member.lastUse, medianGap: member.medianGap })) }, label: "観察" }];
};
