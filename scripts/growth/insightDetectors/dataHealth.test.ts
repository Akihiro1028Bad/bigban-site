import { expect, it } from "vitest";
import { dataHealth } from "./dataHealth";
import { snapshotSchema } from "../snapshotSchema";

it("欠落と前回の半分未満の行数を検出する", () => {
  const previousSnapshot = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "x", coverage: { start: "", end: "" }, meta: { inputs: [{ type: "yoyaku", rows: 10 }], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [] });
  const bundle = { meta: { missingSections: ["customer"], counts: { yoyaku: 4 } } };
  const output = dataHealth({ bundle: bundle as never, previousSnapshot, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" });
  expect(output.map((insight) => insight.id)).toEqual(["d11:missing", "d11:rowdrop:yoyaku"]);
  expect(output[1].severity).toBe("alert");
});

it("前回入力が無い・前回行数が0・半減していない場合は行数急減を出さない", () => {
  const previousSnapshot = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "x", coverage: { start: "", end: "" }, meta: { inputs: [{ type: "zero", rows: 0 }, { type: "stable", rows: 10 }, { type: "missing", rows: 10 }], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [] });
  const bundle = { meta: { missingSections: [], counts: { stable: 5 } } };
  expect(dataHealth({ bundle: bundle as never, previousSnapshot, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});
