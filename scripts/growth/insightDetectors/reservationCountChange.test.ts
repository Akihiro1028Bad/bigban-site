import { expect, it } from "vitest";
import { reservationCountChange } from "./reservationCountChange";

it("履歴4週未満では何も出さない", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], remarks: [], meta: { generatedAt: "2026-07-16T00:00:00+09:00" } };
  expect(reservationCountChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});

function rowsForWeeks(counts: readonly number[]) {
  const weeks = ["2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13"];
  return weeks.flatMap((week, weekIndex) => Array.from({ length: counts[weekIndex] }, (_, index) => ({ reservationId: `${week}-${index}`, bookedAt: `${week}T10:00:00+09:00`, status: "confirmed" })));
}

it("前4週平均から有意に多い週をnoticeにする", () => {
  const bundle = { reservations: rowsForWeeks([2, 2, 2, 2, 9]), customers: [], salesDaily: [], remarks: [], meta: { generatedAt: "2026-07-20T00:00:00+09:00" } };
  expect(reservationCountChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })[0]).toMatchObject({ severity: "notice", label: "有意", evidence: { observed: 9, baselineMean: 2 } });
});

it("有意ではない急減は観察infoにする", () => {
  const bundle = { reservations: rowsForWeeks([2, 2, 2, 2, 1]), customers: [], salesDaily: [], remarks: [], meta: { generatedAt: "2026-07-20T00:00:00+09:00" } };
  expect(reservationCountChange({ bundle: bundle as never, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })[0]).toMatchObject({ severity: "info", label: "観察" });
});
