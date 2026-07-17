import { snapshotSchema } from "../snapshotSchema";

/** P2b の表示テストで共有する、PIIを含まない合成スナップショット。 */
export function analyticsSnapshot() {
  return snapshotSchema.parse({
    schemaVersion: 1,
    generatedAt: "2026-07-17T12:00:00+09:00",
    coverage: { start: "2026-06-01", end: "2026-07-17" },
    analysis: { referenceYmd: "2026-07-17", currentWeek: { start: "2026-07-13", end: "2026-07-19" } },
    meta: {
      sourceSyncedAt: "2026-07-17T12:00:00+09:00",
      inputs: [{ type: "yoyaku", rows: 24 }],
      excludedCount: 1,
      missingSections: [],
      warnings: [],
    },
    kpi: {
      actual: { currentWeek: 8, priorWeek: 6, cumulative: 42 },
      self: { selfCount4w: 9, total4w: 12, smartphone4w: 7 },
      sales: { currentWeek: 32000, priorWeek: 28000, forecast28: 128000 },
    },
    catalog: {
      heatmap: [
        { dow: 1, slot: "10:00", count: 0 }, { dow: 2, slot: "10:00", count: 2 },
        { dow: 3, slot: "10:00", count: 4 }, { dow: 4, slot: "10:00", count: 8 },
      ],
      leadTime: null,
      cancellation: null,
      wards: [{ ward: "足立区", customers: 8, reservations: 12 }, { ward: "葛飾区", customers: 3, reservations: 5 }],
    },
    series: { weeklyReservations: [{ weekStart: "2026-07-13", count: 8 }] },
    insights: [
      { id: "info", detector: "D1", severity: "info", title: "情報", body: "情報本文", evidence: { n: 3 }, label: "観察", firstSeen: "2026-07-15", status: "new" },
      { id: "alert", detector: "D11", severity: "alert", title: "要確認", body: "警告本文", evidence: { n: 12, ci: "95%" }, label: "有意", firstSeen: "2026-07-14", status: "new" },
      { id: "notice", detector: "D3", severity: "notice", title: "注目", body: "注目本文", evidence: { n: 10 }, label: "有意", firstSeen: "2026-07-16", status: "recurring" },
    ],
  });
}
