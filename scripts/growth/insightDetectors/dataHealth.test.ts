import { expect, it } from "vitest";
import { dataHealth } from "./dataHealth";
import { snapshotSchema } from "../snapshotSchema";
import type { DetectorContext } from "../insightEngine";
import type { Snapshot } from "../snapshotSchema";

function captureFunnel(ga4Complete: number, selfBooked: number) {
  return {
    week: { start: "2026-07-13", end: "2026-07-19" },
    current: { intent: 0, rental: { input: 0, confirm: 0, pending: 0, complete: ga4Complete }, program: { input: 0, confirm: 0, pending: 0, complete: 0 } },
    prior: { intent: 0, rental: { input: 0, confirm: 0, pending: 0, complete: 0 }, program: { input: 0, confirm: 0, pending: 0, complete: 0 } },
    capture: { ga4Complete, selfBooked, rate: selfBooked === 0 ? null : ga4Complete / selfBooked },
  };
}

function dataHealthContext(funnel: DetectorContext["funnel"], previousSnapshot: Snapshot | null = null): DetectorContext {
  return {
    bundle: { meta: { missingSections: [], counts: {} } } as never,
    previousSnapshot,
    baselineInputs: null,
    current: { start: "", end: "" },
    prior: { start: "", end: "" },
    todayYmd: "",
    funnel,
  };
}

it("欠落と基準入力の半分未満の行数を検出する", () => {
  const previousSnapshot = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-16T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, analysis: { referenceYmd: "2026-07-16", currentWeek: { start: "2026-07-13", end: "2026-07-19" } }, meta: { sourceSyncedAt: "2026-07-16T00:00:00+09:00", inputs: [{ type: "yoyaku", rows: 10 }], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [] });
  const bundle = { meta: { missingSections: ["customer"], counts: { yoyaku: 4 } } };
  const output = dataHealth({ bundle: bundle as never, previousSnapshot: null, baselineInputs: previousSnapshot.meta.inputs, funnel: null, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" });
  expect(output.map((insight) => insight.id)).toEqual(["d11:missing:customer", "d11:rowdrop:yoyaku"]);
  expect(output[1].severity).toBe("alert");
});

it("前回入力が無い・前回行数が0・半減していない場合は行数急減を出さない", () => {
  const previousSnapshot = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-16T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, analysis: { referenceYmd: "2026-07-16", currentWeek: { start: "2026-07-13", end: "2026-07-19" } }, meta: { sourceSyncedAt: "2026-07-16T00:00:00+09:00", inputs: [{ type: "zero", rows: 0 }, { type: "stable", rows: 10 }, { type: "missing", rows: 10 }], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [] });
  const bundle = { meta: { missingSections: [], counts: { stable: 5 } } };
  expect(dataHealth({ bundle: bundle as never, previousSnapshot, baselineInputs: previousSnapshot.meta.inputs, funnel: null, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});

it("欠落種別を並び替えたIDにして内容変更を新規通知できる", () => {
  const bundle = { meta: { missingSections: ["sales", "customer"], counts: {} } };
  const output = dataHealth({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, funnel: null, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" });
  expect(output[0]).toMatchObject({ id: "d11:missing:customer,sales", evidence: { missingSections: ["customer", "sales"] } });
});

it("セルフ予約が5件以上でGA4予約完了が0件ならタグ破損の疑いを通知する", () => {
  expect(dataHealth(dataHealthContext(captureFunnel(0, 5)))).toContainEqual(expect.objectContaining({
    id: "d11:capture:zero",
    severity: "alert",
    title: "タグ破損の疑い: セルフ予約があるのにGA4完了が0件",
    body: "セルフ予約があるのにGA4の予約完了イベントが1件も計測されていません。LaBOLAのタグ設定を確認してください。",
    evidence: { n: 5, ga4Complete: 0 },
    label: "観察",
  }));
});

it("セルフ予約が5件未満ならGA4予約完了0件でもタグ破損を通知しない", () => {
  expect(dataHealth(dataHealthContext(captureFunnel(0, 4)))).toEqual([]);
});

it("捕捉率が0.5以上の前回から半分未満に急落したら通知する", () => {
  const previousSnapshot = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-09T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-09" }, analysis: { referenceYmd: "2026-07-09", currentWeek: { start: "2026-07-06", end: "2026-07-12" } }, meta: { sourceSyncedAt: "2026-07-09T00:00:00+09:00", inputs: [], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, funnel: captureFunnel(8, 10), insights: [] });
  expect(dataHealth(dataHealthContext(captureFunnel(3, 10), previousSnapshot))).toContainEqual(expect.objectContaining({ id: "d11:capture:drop", severity: "alert", title: "GA4捕捉率が急落", body: "捕捉率が前回の半分未満に落ちています。タグ破損・設定変更の可能性があります。", evidence: { n: 10, rate: 0.3, previousRate: 0.8 }, label: "観察" }));
});

it("前回捕捉率が0.5未満・半分ちょうど・前回funnel欠落では急落を通知しない", () => {
  const snapshot = (rate: number | null) => snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-09T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-09" }, analysis: { referenceYmd: "2026-07-09", currentWeek: { start: "2026-07-06", end: "2026-07-12" } }, meta: { sourceSyncedAt: "2026-07-09T00:00:00+09:00", inputs: [], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, ...(rate === null ? {} : { funnel: { ...captureFunnel(1, 1), capture: { ga4Complete: 1, selfBooked: 1, rate } } }), insights: [] });
  expect(dataHealth(dataHealthContext(captureFunnel(1, 10), snapshot(0.4)))).toEqual([]);
  expect(dataHealth(dataHealthContext(captureFunnel(4, 10), snapshot(0.8)))).toEqual([]);
  expect(dataHealth(dataHealthContext(captureFunnel(1, 10), snapshot(null)))).toEqual([]);
});

it("今回または前回の捕捉率がnullなら急落を通知しない", () => {
  const previousSnapshot = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-09T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-09" }, analysis: { referenceYmd: "2026-07-09", currentWeek: { start: "2026-07-06", end: "2026-07-12" } }, meta: { sourceSyncedAt: "2026-07-09T00:00:00+09:00", inputs: [], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, funnel: { ...captureFunnel(1, 1), capture: { ga4Complete: 1, selfBooked: 1, rate: null } }, insights: [] });
  expect(dataHealth(dataHealthContext({ ...captureFunnel(1, 10), capture: { ga4Complete: 1, selfBooked: 10, rate: null } }, previousSnapshot))).toEqual([]);
  expect(dataHealth(dataHealthContext(captureFunnel(1, 10), previousSnapshot))).toEqual([]);
});

it("GA4予約完了が0件なら急落とは重複させずタグ破損だけを通知する", () => {
  const previousSnapshot = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-09T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-09" }, analysis: { referenceYmd: "2026-07-09", currentWeek: { start: "2026-07-06", end: "2026-07-12" } }, meta: { sourceSyncedAt: "2026-07-09T00:00:00+09:00", inputs: [], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, funnel: captureFunnel(8, 10), insights: [] });
  expect(dataHealth(dataHealthContext(captureFunnel(0, 10), previousSnapshot)).map((insight) => insight.id)).toEqual(["d11:capture:zero"]);
});

it("funnel未取得時は捕捉率の気づきを追加しない", () => {
  expect(dataHealth(dataHealthContext(null))).toEqual([]);
});
