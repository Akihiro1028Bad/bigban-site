import { describe, expect, it } from "vitest";
import { runDetectors } from "./insightEngine";
import { snapshotSchema } from "./snapshotSchema";

const context = {
  bundle: { reservations: [], customers: [], salesDaily: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-16T00:00:00+09:00", sourceSyncedAt: "2026-07-16T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: [], warnings: [] } },
  current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "2026-07-06", end: "2026-07-12" }, todayYmd: "2026-07-16",
};

describe("runDetectors", () => {
  it("前回と同じidをrecurringにしてfirstSeenを引き継ぐ", () => {
    const previousSnapshot = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-09T00:00:00+09:00", coverage: context.bundle.meta.coverage, meta: { sourceSyncedAt: "2026-07-09T00:00:00+09:00", inputs: [], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [{ id: "d1:ward:葛飾区", detector: "D1", severity: "notice", title: "x", body: "x", evidence: {}, label: "観察", firstSeen: "2026-07-09", status: "new" }] });
    const output = runDetectors({ ...context, previousSnapshot }, [() => [{ id: "d1:ward:葛飾区", detector: "D1", severity: "notice", title: "x", body: "x", evidence: {}, label: "観察" }]]);
    expect(output[0]).toMatchObject({ status: "recurring", firstSeen: "2026-07-09" });
  });

  it("前回に無いidはnewと当日firstSeenを付与し、同一idは最後の提案を採用する", () => {
    const output = runDetectors({ ...context, previousSnapshot: null }, [
      () => [{ id: "d:test", detector: "D", severity: "info", title: "旧", body: "", evidence: {}, label: "観察" }],
      () => [{ id: "d:test", detector: "D", severity: "notice", title: "新", body: "", evidence: {}, label: "観察" }],
    ]);
    expect(output).toEqual([expect.objectContaining({ id: "d:test", title: "新", status: "new", firstSeen: "2026-07-16" })]);
  });
});
