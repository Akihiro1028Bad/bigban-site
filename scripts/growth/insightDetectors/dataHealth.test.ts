import { expect, it } from "vitest";
import { dataHealth } from "./dataHealth";
import { snapshotSchema } from "../snapshotSchema";

it("欠落と基準入力の半分未満の行数を検出する", () => {
  const previousSnapshot = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-16T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, analysis: { referenceYmd: "2026-07-16", currentWeek: { start: "2026-07-13", end: "2026-07-19" } }, meta: { sourceSyncedAt: "2026-07-16T00:00:00+09:00", inputs: [{ type: "yoyaku", rows: 10 }], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [] });
  const bundle = { meta: { missingSections: ["customer"], counts: { yoyaku: 4 } } };
  const output = dataHealth({ bundle: bundle as never, previousSnapshot: null, baselineInputs: previousSnapshot.meta.inputs, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" });
  expect(output.map((insight) => insight.id)).toEqual(["d11:missing:customer", "d11:rowdrop:yoyaku"]);
  expect(output[1].severity).toBe("alert");
});

it("前回入力が無い・前回行数が0・半減していない場合は行数急減を出さない", () => {
  const previousSnapshot = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-16T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, analysis: { referenceYmd: "2026-07-16", currentWeek: { start: "2026-07-13", end: "2026-07-19" } }, meta: { sourceSyncedAt: "2026-07-16T00:00:00+09:00", inputs: [{ type: "zero", rows: 0 }, { type: "stable", rows: 10 }, { type: "missing", rows: 10 }], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [] });
  const bundle = { meta: { missingSections: [], counts: { stable: 5 } } };
  expect(dataHealth({ bundle: bundle as never, previousSnapshot, baselineInputs: previousSnapshot.meta.inputs, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});

it("欠落種別を並び替えたIDにして内容変更を新規通知できる", () => {
  const bundle = { meta: { missingSections: ["sales", "customer"], counts: {} } };
  const output = dataHealth({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" });
  expect(output[0]).toMatchObject({ id: "d11:missing:customer,sales", evidence: { missingSections: ["customer", "sales"] } });
});
