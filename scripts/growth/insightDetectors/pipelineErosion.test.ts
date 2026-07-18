import { describe, expect, it } from "vitest";
import { pipelineErosion } from "./pipelineErosion";

function detect(current: number | null, previous: number | null, referenceYmd: string) {
  return pipelineErosion({ bundle: {} as never, previousSnapshot: previous === null ? null : { analysis: { referenceYmd }, kpi: { sales: { forecast28: previous } } }, baselineInputs: null, history: [], funnel: null, onTheBooks: null, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0, unknown4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: current } }, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "2026-07-16" } as never);
}
describe("pipelineErosion", () => {
  it("7日以内に見込みが30%超減なら観察通知する", () => expect(detect(69, 100, "2026-07-09")).toEqual([expect.objectContaining({ id: "d9:erosion", severity: "notice", evidence: { current: 69, previous: 100, dropPct: 31 }, label: "観察" })]));
  it("8日窓ずれ、0.7倍ちょうど、欠損または0の基準値は沈黙する", () => {
    expect(detect(60, 100, "2026-07-08")).toEqual([]); expect(detect(70, 100, "2026-07-09")).toEqual([]); expect(detect(null, 100, "2026-07-09")).toEqual([]); expect(detect(1, 0, "2026-07-09")).toEqual([]);
  });
});
