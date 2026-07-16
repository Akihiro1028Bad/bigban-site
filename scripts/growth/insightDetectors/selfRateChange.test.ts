import { expect, it } from "vitest";
import { selfRateChange } from "./selfRateChange";

it("各期間nが10未満なら変化を出さない", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], remarks: [], meta: {} };
  expect(selfRateChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});

it("28日窓のWilson区間が重ならないセルフ予約率をnoticeにする", () => {
  const reservations = [
    ...Array.from({ length: 10 }, (_, index) => ({ reservationId: `current-${index}`, bookedAt: "2026-07-01T10:00:00+09:00", status: "confirmed", channel: "user_sp" })),
    ...Array.from({ length: 10 }, (_, index) => ({ reservationId: `prior-${index}`, bookedAt: "2026-06-01T10:00:00+09:00", status: "confirmed", channel: "admin" })),
  ];
  const bundle = { reservations, customers: [], salesDaily: [], remarks: [], meta: {} };
  expect(selfRateChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })[0]).toMatchObject({ id: "d3:selfRate:2026-07-13", severity: "notice", label: "有意" });
});
