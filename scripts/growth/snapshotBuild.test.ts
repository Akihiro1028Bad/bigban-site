import { expect, it } from "vitest";
import { buildSnapshot } from "./snapshotBuild";

it("集計と検出結果をスキーマ適合したスナップショットにする", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, counts: { yoyaku: 0 }, excludedCount: 0, missingSections: [], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, current: { start: "2026-07-06", end: "2026-07-12" }, prior: { start: "2026-06-29", end: "2026-07-05" }, todayYmd: "2026-07-16", previousSnapshot: null });
  expect(snapshot.kpi.actual.cumulative).toBe(0);
  expect(snapshot.meta.inputs).toEqual([{ type: "yoyaku", rows: 0 }]);
  expect(snapshot.insights).toEqual([]);
});

it("入力欠落をD11の気づきとしてスナップショットへ接続する", () => {
  const bundle = { reservations: [], customers: [], salesDaily: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, counts: {}, excludedCount: 0, missingSections: ["customer"], warnings: [] } };
  const snapshot = buildSnapshot({ bundle: bundle as never, current: { start: "2026-07-06", end: "2026-07-12" }, prior: { start: "2026-06-29", end: "2026-07-05" }, todayYmd: "2026-07-16", previousSnapshot: null });
  expect(snapshot.insights).toEqual([expect.objectContaining({ id: "d11:missing", status: "new" })]);
});
