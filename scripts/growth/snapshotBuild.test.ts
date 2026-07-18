import { expect, it } from "vitest";
import { buildSnapshot } from "./snapshotBuild";

const funnelCounts = {
  current: { intent: 10, rental: { input: 8, confirm: 6, pending: 5, complete: 3 }, program: { input: 4, confirm: 3, pending: 2, complete: 2 } },
  prior: { intent: 8, rental: { input: 6, confirm: 5, pending: 4, complete: 2 }, program: { input: 3, confirm: 2, pending: 1, complete: 1 } },
};

it("集計と検出結果をスキーマ適合したスナップショットにする", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-16T12:00:00+09:00", sourceSyncedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, reservationsDigest: "", counts: { yoyaku: 0 }, excludedCount: 0, missingSections: [], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, coverage: bundle.meta.coverage, sourceSyncedAt: bundle.meta.sourceSyncedAt, current: { start: "2026-07-06", end: "2026-07-12" }, prior: { start: "2026-06-29", end: "2026-07-05" }, todayYmd: "2026-07-16", previousSnapshot: null, baselineInputs: null, funnelCounts: null });
  expect(snapshot.kpi.actual.cumulative).toBe(0);
  expect(snapshot.kpi.self.unknown4w).toBe(0);
  expect(snapshot.meta.inputs).toEqual([{ type: "yoyaku", rows: 0 }]);
  expect(snapshot.meta.sourceSyncedAt).toBe("2026-07-16T12:00:00+09:00");
  expect(snapshot.analysis).toEqual({ referenceYmd: "2026-07-16", currentWeek: { start: "2026-07-06", end: "2026-07-12" } });
  expect(snapshot.insights).toEqual([]);
});

it("入力欠落をD11の気づきとしてスナップショットへ接続する", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-16T12:00:00+09:00", sourceSyncedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: ["customer"], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, coverage: bundle.meta.coverage, sourceSyncedAt: bundle.meta.sourceSyncedAt, current: { start: "2026-07-06", end: "2026-07-12" }, prior: { start: "2026-06-29", end: "2026-07-05" }, todayYmd: "2026-07-16", previousSnapshot: null, baselineInputs: null, funnelCounts: null });
  expect(snapshot.insights).toEqual([expect.objectContaining({ id: "d11:missing:customer", status: "new" })]);
});

it("予約不可・プログラムCSVが欠落した集計値は未計上にする", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-16T12:00:00+09:00", sourceSyncedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: ["program", "blocked"], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, coverage: bundle.meta.coverage, sourceSyncedAt: bundle.meta.sourceSyncedAt, current: { start: "2026-07-06", end: "2026-07-12" }, prior: { start: "2026-06-29", end: "2026-07-05" }, todayYmd: "2026-07-16", previousSnapshot: null, baselineInputs: null, funnelCounts: null });
  expect(snapshot.catalog.programFills).toBeUndefined();
  expect(snapshot.catalog.revPach).toBeUndefined();
});

it("7/5までのCSVを7/16に取り込んでも、未収録の7/6週を0件の急減として検出しない", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-16T12:00:00+09:00", sourceSyncedAt: "2026-07-05T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-05" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: [], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, coverage: bundle.meta.coverage, sourceSyncedAt: bundle.meta.sourceSyncedAt, current: { start: "2026-07-06", end: "2026-07-12" }, prior: { start: "2026-06-29", end: "2026-07-05" }, todayYmd: "2026-07-16", previousSnapshot: null, baselineInputs: null, funnelCounts: null });
  expect(snapshot.series.weeklyReservations.at(-1)).toEqual({ weekStart: "2026-06-29", count: 0 });
  expect(snapshot.insights.find((insight) => insight.detector === "D2")).toBeUndefined();
});

it("ファネル未取得時はfunnelキーを出力しない", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-16T12:00:00+09:00", sourceSyncedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: [], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, coverage: bundle.meta.coverage, sourceSyncedAt: bundle.meta.sourceSyncedAt, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "2026-07-06", end: "2026-07-12" }, todayYmd: "2026-07-16", previousSnapshot: null, baselineInputs: null, funnelCounts: null });
  expect("funnel" in snapshot).toBe(false);
});

it("CSV収録範囲が対象週を完全に含む場合はファネルとセルフ予約の捕捉率を出力する", () => {
  const reservation = { reservationId: "self", bookedAt: "2026-07-14T10:00:00+09:00", useDate: "2026-07-18", start: "19:00", end: "21:00", category: "スペース予約", space: "Aコート", status: "confirmed", acceptStatus: "受付済", paymentStatus: "未払い", paymentMethod: "カード", plan: "一般", amount: 1000, partySize: null, channel: "user_sp", customerType: "一般", pseudoId: "a", ward: "台東区", ageBand: "30代", gender: "", occupationGroup: "会社員", hasRemarks: false };
  const bundle = { reservations: [reservation], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-19T12:00:00+09:00", sourceSyncedAt: "2026-07-19T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-19" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: [], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, coverage: bundle.meta.coverage, sourceSyncedAt: bundle.meta.sourceSyncedAt, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "2026-07-06", end: "2026-07-12" }, todayYmd: "2026-07-19", previousSnapshot: null, baselineInputs: null, funnelCounts });
  expect(snapshot.funnel).toEqual(expect.objectContaining({ week: { start: "2026-07-13", end: "2026-07-19" }, capture: { ga4Complete: 5, selfBooked: 1, rate: 5 } }));
});

it("セルフ予約がないときの捕捉率はnullにする", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-19T12:00:00+09:00", sourceSyncedAt: "2026-07-19T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-19" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: [], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, coverage: bundle.meta.coverage, sourceSyncedAt: bundle.meta.sourceSyncedAt, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "2026-07-06", end: "2026-07-12" }, todayYmd: "2026-07-19", previousSnapshot: null, baselineInputs: null, funnelCounts });
  expect(snapshot.funnel?.capture).toEqual({ ga4Complete: 5, selfBooked: 0, rate: null });
});

it("今回のスナップショットに載せるfunnelでD11のタグ破損を検出する", () => {
  const reservations = Array.from({ length: 5 }, (_, index) => ({ reservationId: `self-${index}`, bookedAt: "2026-07-14T10:00:00+09:00", useDate: "2026-07-18", start: "19:00", end: "21:00", category: "スペース予約", space: "Aコート", status: "confirmed", acceptStatus: "受付済", paymentStatus: "未払い", paymentMethod: "カード", plan: "一般", amount: 1000, partySize: null, channel: "user_sp", customerType: "一般", pseudoId: `user-${index}`, ward: "台東区", ageBand: "30代", gender: "", occupationGroup: "会社員", hasRemarks: false }));
  const bundle = { reservations, customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-19T12:00:00+09:00", sourceSyncedAt: "2026-07-19T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-19" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: [], warnings: [] } };
  const zeroCompleteFunnel = { ...funnelCounts, current: { ...funnelCounts.current, rental: { ...funnelCounts.current.rental, complete: 0 }, program: { ...funnelCounts.current.program, complete: 0 } } };
  const snapshot = buildSnapshot({ bundle: bundle as never, coverage: bundle.meta.coverage, sourceSyncedAt: bundle.meta.sourceSyncedAt, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "2026-07-06", end: "2026-07-12" }, todayYmd: "2026-07-19", previousSnapshot: null, baselineInputs: null, funnelCounts: zeroCompleteFunnel });
  expect(snapshot.insights).toContainEqual(expect.objectContaining({ id: "d11:capture:zero", evidence: { n: 5, ga4Complete: 0 } }));
});

it("CSV収録範囲が対象週を含まない場合はファネルを省略して警告する", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-16T12:00:00+09:00", sourceSyncedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: [], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, coverage: bundle.meta.coverage, sourceSyncedAt: bundle.meta.sourceSyncedAt, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "2026-07-06", end: "2026-07-12" }, todayYmd: "2026-07-16", previousSnapshot: null, baselineInputs: null, funnelCounts });

  expect(snapshot.funnel).toBeUndefined();
  expect(snapshot.meta.warnings).toContain("CSVの収録範囲が対象週を含まないためファネルを省略しました");
});

it("CSV収録開始日が対象週より後の場合もファネルを省略する", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-19T12:00:00+09:00", sourceSyncedAt: "2026-07-19T12:00:00+09:00", coverage: { start: "2026-07-14", end: "2026-07-19" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: [], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, coverage: bundle.meta.coverage, sourceSyncedAt: bundle.meta.sourceSyncedAt, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "2026-07-06", end: "2026-07-12" }, todayYmd: "2026-07-19", previousSnapshot: null, baselineInputs: null, funnelCounts });

  expect(snapshot.funnel).toBeUndefined();
  expect(snapshot.meta.warnings).toContain("CSVの収録範囲が対象週を含まないためファネルを省略しました");
});
