import { expect, it } from "vitest";
import { fillSpeed } from "./fillSpeed";

function program(name: string, heldOn: string, capacity: number | null = 2) { return { name, heldOn, start: "10:00", end: "11:00", capacity, publishStatus: "公開" }; }
function reservation(reservationId: string, name: string, heldOn: string, bookedAt: string) { return { reservationId, bookedAt, useDate: heldOn, start: "10:00", category: "スクール", space: name, status: "confirmed" }; }
function detect(programs: object[], reservations: object[]) {
  const bundle = { programs, reservations, customers: [], salesDaily: [], blockedSlots: [], remarks: [], meta: { coverage: { start: "2026-06-01", end: "2026-07-19" } } };
  return fillSpeed({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, history: [], funnel: null, onTheBooks: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "2026-07-19" });
}

it("過去より早く満枠になった回をnoticeにする", () => {
  const programs = [program("初級", "2026-07-20"), program("初級", "2026-07-25")];
  const reservations = [reservation("p1", "初級", "2026-07-20", "2026-07-09T10:00:00+09:00"), reservation("p2", "初級", "2026-07-20", "2026-07-10T10:00:00+09:00"), reservation("c1", "初級", "2026-07-25", "2026-07-13T10:00:00+09:00"), reservation("c2", "初級", "2026-07-25", "2026-07-14T10:00:00+09:00")];
  expect(detect(programs, reservations)).toEqual([expect.objectContaining({ id: "d5:fastest:初級", severity: "notice", body: "満枠が過去最速", evidence: { n: 2, daysBeforeHeld: 11, previousBest: 10 }, label: "観察" })]);
});

it("過去実績がない初満枠をinfoにする", () => {
  const programs = [program("初級", "2026-07-25")];
  const reservations = [reservation("c1", "初級", "2026-07-25", "2026-07-13T10:00:00+09:00"), reservation("c2", "初級", "2026-07-25", "2026-07-14T10:00:00+09:00")];
  expect(detect(programs, reservations)[0]).toMatchObject({ id: "d5:first:初級", severity: "info", body: "初の満枠", evidence: { previousBest: null }, label: "観察" });
});

it("定員未満は対象外にする", () => {
  expect(detect([program("初級", "2026-07-25")], [reservation("c1", "初級", "2026-07-25", "2026-07-14T10:00:00+09:00")])).toEqual([]);
});

it("今週以外に満枠になった回は通知しない", () => {
  const programs = [program("初級", "2026-07-25")];
  const reservations = [reservation("c1", "初級", "2026-07-25", "2026-07-11T10:00:00+09:00"), reservation("c2", "初級", "2026-07-25", "2026-07-12T10:00:00+09:00")];
  expect(detect(programs, reservations)).toEqual([]);
});

it("過去最速と同値なら通知しない", () => {
  const programs = [program("初級", "2026-07-20"), program("初級", "2026-07-25")];
  const reservations = [reservation("p1", "初級", "2026-07-20", "2026-07-09T10:00:00+09:00"), reservation("p2", "初級", "2026-07-20", "2026-07-10T10:00:00+09:00"), reservation("c1", "初級", "2026-07-25", "2026-07-14T10:00:00+09:00"), reservation("c2", "初級", "2026-07-25", "2026-07-15T10:00:00+09:00")];
  expect(detect(programs, reservations)).toEqual([]);
});

it("定員なし・0人定員・開催後に到達した満枠を除外する", () => {
  const programs = [program("定員なし", "2026-07-25", null), program("定員0", "2026-07-25", 0), program("開催後", "2026-07-15")];
  const reservations = [reservation("n1", "定員なし", "2026-07-25", "2026-07-14T10:00:00+09:00"), reservation("z1", "定員0", "2026-07-25", "2026-07-14T10:00:00+09:00"), reservation("a1", "開催後", "2026-07-15", "2026-07-14T10:00:00+09:00"), reservation("a2", "開催後", "2026-07-15", "2026-07-16T10:00:00+09:00")];
  expect(detect(programs, reservations)).toEqual([]);
});

it("満枠時刻が同時なら開催日→開始時刻の順で安定して並べる", () => {
  const programs = [
    program("初級", "2026-07-25"),
    program("初級", "2026-07-26"),
    { name: "初級", heldOn: "2026-07-26", start: "12:00", end: "13:00", capacity: 2, publishStatus: "公開" },
  ];
  const reservations = [
    reservation("a1", "初級", "2026-07-25", "2026-07-13T10:00:00+09:00"), reservation("a2", "初級", "2026-07-25", "2026-07-14T10:00:00+09:00"),
    reservation("b1", "初級", "2026-07-26", "2026-07-13T10:00:00+09:00"), reservation("b2", "初級", "2026-07-26", "2026-07-14T10:00:00+09:00"),
    { reservationId: "c1", bookedAt: "2026-07-13T10:00:00+09:00", useDate: "2026-07-26", start: "12:00", category: "スクール", space: "初級", status: "confirmed" },
    { reservationId: "c2", bookedAt: "2026-07-14T10:00:00+09:00", useDate: "2026-07-26", start: "12:00", category: "スクール", space: "初級", status: "confirmed" },
  ];
  // 開催日が近いA(11日前)が先頭になり初満枠info、次のB(12日前)が過去最速notice、同値のCは通知なし。
  expect(detect(programs, reservations).map((insight) => insight.id)).toEqual(["d5:first:初級", "d5:fastest:初級"]);
});

it("同週の複数満枠は直前までの実績と比較し、初回だけをinfoにする", () => {
  const programs = [program("初級", "2026-07-20"), program("初級", "2026-07-25")];
  const reservations = [reservation("a1", "初級", "2026-07-20", "2026-07-13T10:00:00+09:00"), reservation("a2", "初級", "2026-07-20", "2026-07-14T10:00:00+09:00"), reservation("b1", "初級", "2026-07-25", "2026-07-14T10:00:00+09:00"), reservation("b2", "初級", "2026-07-25", "2026-07-15T10:00:00+09:00")];
  expect(detect(programs, reservations)).toEqual([
    expect.objectContaining({ id: "d5:first:初級", detector: "D5", severity: "info", title: "満枠到達速度", body: "初の満枠", evidence: { n: 2, daysBeforeHeld: 6, previousBest: null }, label: "観察" }),
    expect.objectContaining({ id: "d5:fastest:初級", detector: "D5", severity: "notice", title: "満枠到達速度", body: "満枠が過去最速", evidence: { n: 2, daysBeforeHeld: 10, previousBest: 6 }, label: "観察" }),
  ]);
});
