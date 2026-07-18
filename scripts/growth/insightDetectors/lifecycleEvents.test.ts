import { describe, expect, it } from "vitest";
import { lifecycleEvents } from "./lifecycleEvents";

function reservation(id: string, pseudoId: string | null, bookedAt: string, customerType = "ビジター") {
  return { reservationId: id, pseudoId, bookedAt, customerType, status: "confirmed" };
}

function detect(reservations: object[]) {
  return lifecycleEvents({ bundle: { reservations }, previousSnapshot: null, baselineInputs: null, history: [], funnel: null, onTheBooks: null, kpi: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "2026-07-16" } as never);
}

describe("lifecycleEvents", () => {
  it("施設初のリピートをnoticeで観察する", () => {
    expect(detect([reservation("a", "customer", "2026-07-01T10:00:00+09:00"), reservation("b", "customer", "2026-07-14T10:00:00+09:00")])).toEqual([expect.objectContaining({ id: "d7:first-repeat", severity: "notice", label: "観察" })]);
  });
  it("既存リピーターがいれば週の人数をまとめる", () => {
    expect(detect([reservation("old1", "old", "2026-06-01T10:00:00+09:00"), reservation("old2", "old", "2026-06-02T10:00:00+09:00"), reservation("a", "new", "2026-07-01T10:00:00+09:00"), reservation("b", "new", "2026-07-14T10:00:00+09:00")])).toContainEqual(expect.objectContaining({ id: "d7:repeats:2026-07-13", evidence: { n: 1 } }));
  });
  it("2回目が週外、pseudoIdなし、取消は数えない", () => {
    const cancelled = { ...reservation("c", "x", "2026-07-14T10:00:00+09:00"), status: "cancelled" };
    expect(detect([reservation("a", "x", "2026-07-01T10:00:00+09:00"), cancelled, reservation("n", null, "2026-07-14T10:00:00+09:00")])).toEqual([]);
  });
  it("ビジターだけを転換元とし、非会員・空欄は対象外にする", () => {
    const insights = detect([
      reservation("non-member-past", "non-member", "2026-07-01T10:00:00+09:00", "非会員"),
      reservation("non-member-current", "non-member", "2026-07-14T10:00:00+09:00", "月額会員"),
      reservation("blank-past", "blank", "2026-07-01T10:00:00+09:00", ""),
      reservation("blank-current", "blank", "2026-07-14T10:00:00+09:00", "月額会員"),
      reservation("visitor-past", "visitor", "2026-07-01T10:00:00+09:00", "ビジター"),
      reservation("visitor-current", "visitor", "2026-07-14T10:00:00+09:00", "月額会員"),
    ]);

    expect(insights).toContainEqual(expect.objectContaining({ id: "d7:conversion:2026-07-13", evidence: { n: 1 }, label: "観察" }));
  });
});
