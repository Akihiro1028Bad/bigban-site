import { expect, it } from "vitest";
import { selfRateChange } from "./selfRateChange";

it("各期間nが10未満なら変化を出さない", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { coverage: { start: "2026-05-01", end: "2026-07-19" } } };
  expect(selfRateChange({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});

it("28日窓のWilson区間が重ならないセルフ予約率をnoticeにする", () => {
  const reservations = [
    ...Array.from({ length: 10 }, (_, index) => ({ reservationId: `current-${index}`, bookedAt: "2026-07-01T10:00:00+09:00", status: "confirmed", channel: "user_sp" })),
    ...Array.from({ length: 10 }, (_, index) => ({ reservationId: `prior-${index}`, bookedAt: "2026-06-01T10:00:00+09:00", status: "confirmed", channel: "admin" })),
  ];
  const bundle = { reservations, customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { coverage: { start: "2026-05-01", end: "2026-07-19" } } };
  expect(selfRateChange({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })[0]).toMatchObject({ id: "d3:selfRate:2026-07-13", severity: "notice", label: "有意" });
});

it.each([
  ["直近", "2026-07-01T10:00:00+09:00", "confirmed"],
  ["比較対象", "2026-06-01T10:00:00+09:00", "confirmed"],
  ["直近のキャンセル済み", "2026-07-01T10:00:00+09:00", "cancelled"],
])("%s28日窓にunknown予約が混在すると気づきを出さない", (_window, bookedAt, status) => {
  const reservations = [
    ...Array.from({ length: 10 }, (_, index) => ({ reservationId: `current-${index}`, bookedAt: "2026-07-01T10:00:00+09:00", status: "confirmed", channel: "user_sp" })),
    ...Array.from({ length: 10 }, (_, index) => ({ reservationId: `prior-${index}`, bookedAt: "2026-06-01T10:00:00+09:00", status: "confirmed", channel: "admin" })),
    { reservationId: "unknown", bookedAt, status, channel: "unknown" },
  ];
  const bundle = { reservations, customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { coverage: { start: "2026-05-01", end: "2026-07-19" } } };

  expect(selfRateChange({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});

it("標本数を満たしてもWilson区間が重なる場合は出さない", () => {
  const reservations = [...Array.from({ length: 10 }, (_, index) => ({ reservationId: `current-${index}`, bookedAt: "2026-07-01T10:00:00+09:00", status: "confirmed", channel: index < 5 ? "user_sp" : "admin" })), ...Array.from({ length: 10 }, (_, index) => ({ reservationId: `prior-${index}`, bookedAt: "2026-06-01T10:00:00+09:00", status: "confirmed", channel: index < 5 ? "user_sp" : "admin" }))];
  const bundle = { reservations, customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { coverage: { start: "2026-05-01", end: "2026-07-19" } } };
  expect(selfRateChange({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});
