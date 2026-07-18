import { expect, it } from "vitest";
import { leadTimeShift } from "./leadTimeShift";

function reservation(reservationId: string, bookedYmd: string, leadDays: number) {
  const useDate = new Date(`${bookedYmd}T00:00:00Z`);
  useDate.setUTCDate(useDate.getUTCDate() + leadDays);
  return { reservationId, bookedAt: `${bookedYmd}T10:00:00+09:00`, useDate: useDate.toISOString().slice(0, 10), status: "confirmed" };
}

function detect(reservations: object[]) {
  const bundle = { reservations, customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { coverage: { start: "2026-05-01", end: "2026-07-10" } } };
  return leadTimeShift({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, history: [], funnel: null, onTheBooks: null, kpi: null, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "2026-07-10" });
}

it("リードタイムが伸びる前倒し傾向をnoticeにする", () => {
  const prior = Array.from({ length: 8 }, (_, index) => reservation(`p${index}`, "2026-06-01", 3));
  const current = Array.from({ length: 8 }, (_, index) => reservation(`c${index}`, "2026-07-01", 7));
  expect(detect([...prior, ...current])[0]).toMatchObject({ id: "d4:leadtime", severity: "notice", title: "予約リードタイムの変化", body: "予約が前倒し傾向です", evidence: { n: 8, median: 7, baselineMedian: 3, mad: 0 }, label: "観察" });
});

it("リードタイムが縮む直前予約増加をnoticeにする", () => {
  const prior = Array.from({ length: 8 }, (_, index) => reservation(`p${index}`, "2026-06-01", 7));
  const current = Array.from({ length: 8 }, (_, index) => reservation(`c${index}`, "2026-07-01", 3));
  expect(detect([...prior, ...current])[0]).toMatchObject({ body: "直前予約が増えています", evidence: { median: 3, baselineMedian: 7 } });
});

it("奇数標本の中央値を使い、キャンセル済み予約を除外する", () => {
  const prior = Array.from({ length: 9 }, (_, index) => reservation(`p${index}`, "2026-06-01", 3));
  const current = Array.from({ length: 9 }, (_, index) => reservation(`c${index}`, "2026-07-01", 7));
  const cancelled = { ...reservation("cancelled", "2026-07-01", 30), status: "cancelled" };
  expect(detect([...prior, ...current, cancelled])[0]).toMatchObject({ evidence: { n: 9, median: 7, baselineMedian: 3 } });
});

it("いずれかの窓がn=7なら沈黙する", () => {
  const prior = Array.from({ length: 8 }, (_, index) => reservation(`p${index}`, "2026-06-01", 3));
  const current = Array.from({ length: 7 }, (_, index) => reservation(`c${index}`, "2026-07-01", 7));
  expect(detect([...prior, ...current])).toEqual([]);
});

it("前窓がn=7でも沈黙する", () => {
  const prior = Array.from({ length: 7 }, (_, index) => reservation(`p${index}`, "2026-06-01", 3));
  const current = Array.from({ length: 8 }, (_, index) => reservation(`c${index}`, "2026-07-01", 7));
  expect(detect([...prior, ...current])).toEqual([]);
});

it("前窓MAD以下の差では沈黙する", () => {
  const prior = [0, 0, 0, 0, 10, 10, 10, 10].map((days, index) => reservation(`p${index}`, "2026-06-01", days));
  const current = Array.from({ length: 8 }, (_, index) => reservation(`c${index}`, "2026-07-01", 8));
  expect(detect([...prior, ...current])).toEqual([]);
});

it("負のリードタイムは両窓の標本から除外する", () => {
  const prior = Array.from({ length: 8 }, (_, index) => reservation(`p${index}`, "2026-06-01", 5));
  const current = Array.from({ length: 8 }, (_, index) => reservation(`c${index}`, "2026-07-01", -2));
  expect(detect([...prior, ...current])).toEqual([]);
});

it("差が2日ちょうどなら沈黙し、2日超なら通知する", () => {
  const prior = Array.from({ length: 8 }, (_, index) => reservation(`p${index}`, "2026-06-01", 3));
  const equal = Array.from({ length: 8 }, (_, index) => reservation(`e${index}`, "2026-07-01", 5));
  const greater = Array.from({ length: 8 }, (_, index) => reservation(`g${index}`, "2026-07-01", 6));
  expect(detect([...prior, ...equal])).toEqual([]);
  expect(detect([...prior, ...greater])).toHaveLength(1);
});

it("短縮方向で2日ちょうどの差なら沈黙する", () => {
  const prior = Array.from({ length: 8 }, (_, index) => reservation(`p${index}`, "2026-06-01", 7));
  const current = Array.from({ length: 8 }, (_, index) => reservation(`c${index}`, "2026-07-01", 5));
  expect(detect([...prior, ...current])).toEqual([]);
});

it("前窓の終了日と今窓の開始日を別々の窓へ集計する", () => {
  const prior = Array.from({ length: 8 }, (_, index) => reservation(`p${index}`, "2026-06-12", 3));
  const current = Array.from({ length: 8 }, (_, index) => reservation(`c${index}`, "2026-06-13", 7));
  expect(detect([...prior, ...current])[0]).toMatchObject({ evidence: { n: 8, median: 7, baselineMedian: 3 } });
});

it("28日窓の開始日・終了日を含み、その外側を除外する", () => {
  const prior = Array.from({ length: 8 }, (_, index) => reservation(`p${index}`, "2026-05-16", 3));
  const current = [...Array.from({ length: 7 }, (_, index) => reservation(`c${index}`, "2026-06-13", 7)), reservation("current-end", "2026-07-10", 7)];
  const outside = [reservation("before", "2026-05-15", 30), reservation("after", "2026-07-11", 30)];
  expect(detect([...prior, ...current, ...outside])[0]).toMatchObject({ evidence: { n: 8, median: 7, baselineMedian: 3 } });
});
