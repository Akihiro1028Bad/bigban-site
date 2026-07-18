import { describe, expect, it } from "vitest";
import { unpaidOverdue } from "./unpaidOverdue";
import type { DetectorContext } from "../insightEngine";

function context(): DetectorContext {
  return { todayYmd: "2026-07-16", kpi: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "2026-07-06", end: "2026-07-12" }, previousSnapshot: null, baselineInputs: null, funnel: null, bundle: { reservations: [{ reservationId: "r1", bookedAt: "2026-06-30T10:00:00+09:00", useDate: "2026-07-01", start: "10:00", end: "11:00", category: "スペース予約", space: "A", status: "confirmed", acceptStatus: "", paymentStatus: "未払い", paymentMethod: "", plan: "", amount: 1200, partySize: null, channel: "admin", customerType: "", pseudoId: null, ward: "", ageBand: "", gender: "", occupationGroup: "", hasRemarks: false }], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1, generatedAt: "2026-07-16T00:00:00+09:00", sourceSyncedAt: "2026-07-16T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: [], warnings: [] } } };
}

describe("unpaidOverdue", () => {
  it("15日以上の利用済み未収金を固定IDで通知する", () => expect(unpaidOverdue(context())).toEqual([expect.objectContaining({ id: "d10:unpaid", evidence: expect.objectContaining({ reservationIds: ["r1"] }) })]));
  it("金額未入力の滞留も件数には含め、合計は0として通知する", () => {
    const value = context();
    value.bundle.reservations[0].amount = null;
    expect(unpaidOverdue(value)).toEqual([expect.objectContaining({ body: "15日以上の未払いが1件、合計¥0です。", evidence: expect.objectContaining({ amount: 0 }) })]);
  });
  it("処理待ちは決済処理中のため未収金通知から除外する", () => { const value = context(); value.bundle.reservations[0].paymentStatus = "処理待ち"; expect(unpaidOverdue(value)).toEqual([]); });
  it("未来利用と15日未満は通知しない", () => { const value = context(); value.bundle.reservations[0].useDate = "2026-07-20"; expect(unpaidOverdue(value)).toEqual([]); });
});
