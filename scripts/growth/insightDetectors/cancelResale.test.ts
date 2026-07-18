import { describe, expect, it } from "vitest";
import { cancelResale } from "./cancelResale";

function reservation(id: string, status: "confirmed" | "cancelled", bookedAt: string, useDate = "2026-07-15") { return { reservationId: id, status, bookedAt, useDate, start: "10:00", space: "A" }; }
function detect(reservations: object[]) { return cancelResale({ bundle: { reservations }, previousSnapshot: null, baselineInputs: null, history: [], funnel: null, onTheBooks: null, kpi: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "2026-07-19" } as never); }
describe("cancelResale", () => {
  it("今週利用のキャンセル枠が後続確定予約で再販されれば観察する", () => expect(detect([reservation("c", "cancelled", "2026-07-10T10:00:00Z"), reservation("r", "confirmed", "2026-07-10T12:30:00Z")])).toEqual([expect.objectContaining({ id: "d13:resold:2026-07-13", evidence: { n: 1, medianHours: 2.5 }, label: "観察" })]));
  it("同時刻の受付は再販にせず、今週外の利用枠も通知しない", () => {
    expect(detect([reservation("c", "cancelled", "2026-07-10T10:00:00Z"), reservation("same", "confirmed", "2026-07-10T10:00:00Z"), reservation("old", "cancelled", "2026-07-10T10:00:00Z", "2026-06-20"), reservation("oldr", "confirmed", "2026-07-10T11:00:00Z", "2026-06-20")])).toEqual([]);
  });
});
