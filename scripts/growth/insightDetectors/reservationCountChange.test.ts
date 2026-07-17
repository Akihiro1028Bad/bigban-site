import { expect, it } from "vitest";
import { reservationCountChange } from "./reservationCountChange";

it("履歴4週未満では何も出さない", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], remarks: [], meta: { generatedAt: "2026-07-16T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-19" } } };
  expect(reservationCountChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});

function rowsForWeeks(counts: readonly number[]) {
  const weeks = ["2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13"];
  return weeks.flatMap((week, weekIndex) => Array.from({ length: counts[weekIndex] }, (_, index) => ({ reservationId: `${week}-${index}`, bookedAt: `${week}T10:00:00+09:00`, status: "confirmed" })));
}

it("前4週平均から有意に多い週をnoticeにする", () => {
  const bundle = { reservations: rowsForWeeks([2, 2, 2, 2, 9]), customers: [], salesDaily: [], remarks: [], meta: { generatedAt: "2026-07-20T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-19" } } };
  expect(reservationCountChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })[0]).toMatchObject({ severity: "notice", label: "観察", evidence: { observed: 9, baselineMean: 2 } });
});

it("有意ではない急減は観察infoにする", () => {
  const bundle = { reservations: rowsForWeeks([2, 2, 2, 2, 1]), customers: [], salesDaily: [], remarks: [], meta: { generatedAt: "2026-07-20T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-19" } } };
  expect(reservationCountChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })[0]).toMatchObject({ severity: "info", label: "観察" });
});

it("基準に近い週は気づきを出さない", () => {
  const bundle = { reservations: rowsForWeeks([2, 2, 2, 2, 2]), customers: [], salesDaily: [], remarks: [], meta: { generatedAt: "2026-07-20T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-19" } } };
  expect(reservationCountChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});

it("基準平均も観測も0なら気づきを出さない", () => {
  const bundle = { reservations: [{ reservationId: "before-baseline", bookedAt: "2026-06-08T10:00:00+09:00", status: "confirmed" }], customers: [], salesDaily: [], remarks: [], meta: { generatedAt: "2026-07-20T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-19" } } };
  expect(reservationCountChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});

it("10件以上で有意な上振れは有意ラベルにする", () => {
  const bundle = { reservations: rowsForWeeks([2, 2, 2, 2, 10]), customers: [], salesDaily: [], remarks: [], meta: { generatedAt: "2026-07-20T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-19" } } };
  expect(reservationCountChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })[0].label).toBe("有意");
});

it("current開始週が系列に存在しなければ何も出さない", () => {
  const bundle = { reservations: rowsForWeeks([2, 2, 2, 2, 2]), customers: [], salesDaily: [], remarks: [], meta: { generatedAt: "2026-07-20T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-19" } } };
  expect(reservationCountChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-14", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});
