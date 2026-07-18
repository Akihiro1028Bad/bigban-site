import { expect, it } from "vitest";
import { paceDeviation } from "./paceDeviation";

it("history未指定(旧コンテキスト)では通知しない", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { coverage: { start: "", end: "" } } };
  expect(paceDeviation({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, funnel: null, onTheBooks: [{ daysOut: 28, reservations: 1, baselineMedian: 10 }], current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});

function detect(onTheBooks: { daysOut: number; reservations: number; baselineMedian: number | null }[] | null, historyWeeks = 6) {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { coverage: { start: "", end: "" } } };
  const history = Array.from({ length: historyWeeks }, () => ({ series: { onTheBooks: [{ daysOut: 28, reservations: 1, forecastSales: null, baselineMedian: null }] } }));
  return paceDeviation({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, history: history as never, funnel: null, onTheBooks, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" });
}

it.each([[4, "d6:weak", "今後28日の予約ペースが弱い"], [16, "d6:strong", "今後28日の予約ペースが強い"]] as const)("28日先予約が%s件なら逸脱を通知する", (reservations, id, body) => {
  expect(detect([{ daysOut: 28, reservations, baselineMedian: 10 }])[0]).toMatchObject({ id, severity: "notice", body, evidence: { n: reservations, baselineMedian: 10, historyWeeks: 6 }, label: "観察" });
});

it.each([5, 15])("0.5倍・1.5倍ちょうどでは通知しない", (reservations) => {
  expect(detect([{ daysOut: 28, reservations, baselineMedian: 10 }])).toEqual([]);
});

it.each([null, 4])("基準値%sでは沈黙する", (baselineMedian) => {
  expect(detect([{ daysOut: 28, reservations: 1, baselineMedian }])).toEqual([]);
});

it("onTheBooksが欠落していると沈黙する", () => {
  expect(detect(null)).toEqual([]);
  expect(detect([])).toEqual([]);
});

it("28日先の履歴が5件以下なら基準値があっても沈黙する", () => {
  expect(detect([{ daysOut: 28, reservations: 4, baselineMedian: 10 }], 5)).toEqual([]);
});
