import { expect, it } from "vitest";
import { leadTimeShift } from "./leadTimeShift";

function reservation(reservationId: string, bookedYmd: string, leadDays: number) {
  const useDate = new Date(`${bookedYmd}T00:00:00Z`);
  useDate.setUTCDate(useDate.getUTCDate() + leadDays);
  return { reservationId, bookedAt: `${bookedYmd}T10:00:00+09:00`, useDate: useDate.toISOString().slice(0, 10), status: "confirmed" };
}

function detect(reservations: object[]) {
  const bundle = { reservations, customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { coverage: { start: "2026-05-01", end: "2026-07-10" } } };
  return leadTimeShift({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, history: [], funnel: null, onTheBooks: null, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "2026-07-10" });
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

it("負のリードタイムは0日にクランプする", () => {
  const prior = Array.from({ length: 8 }, (_, index) => reservation(`p${index}`, "2026-06-01", 5));
  const current = Array.from({ length: 8 }, (_, index) => reservation(`c${index}`, "2026-07-01", -2));
  expect(detect([...prior, ...current])[0]).toMatchObject({ body: "直前予約が増えています", evidence: { median: 0, baselineMedian: 5 } });
});
