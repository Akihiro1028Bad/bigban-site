import { describe, expect, it } from "vitest";
import { parseSnapshot, snapshotSchema } from "./snapshotSchema";

function validSnapshot() {
  return {
    schemaVersion: 1, generatedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, analysis: { referenceYmd: "2026-07-16", currentWeek: { start: "2026-07-13", end: "2026-07-19" } },
    meta: { sourceSyncedAt: "2026-07-16T12:00:00+09:00", inputs: [{ type: "yoyaku", rows: 1 }], excludedCount: 0, missingSections: [], warnings: [] },
    kpi: { actual: { currentWeek: 1, priorWeek: 0, cumulative: 1 }, self: { selfCount4w: 1, total4w: 1, smartphone4w: 1 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } },
    catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [],
  };
}

describe("snapshotSchema", () => {
  it("最小の妥当スナップショットを受理する", () => expect(snapshotSchema.safeParse(validSnapshot()).success).toBe(true));
  it("既存スナップショットのunknown4w欠落を0として受理する", () => {
    expect(snapshotSchema.parse(validSnapshot()).kpi.self.unknown4w).toBe(0);
  });
  it("P1拡張フィールドがない旧スナップショットを後方互換で受理する", () => {
    const parsed = parseSnapshot(JSON.stringify(validSnapshot()));
    expect(parsed.catalog.programFills).toBeUndefined();
    expect(parsed.catalog.unpaidAging).toBeUndefined();
    expect(parsed.catalog.revPach).toBeUndefined();
    expect(parsed.catalog.cancelResale).toBeUndefined();
    expect(parsed.catalog.cohorts).toBeUndefined();
    expect(parsed.series.onTheBooks).toBeUndefined();
  });
  it("ファネルあり・なしのJSONを後方互換で受理する", () => {
    const withFunnel = {
      ...validSnapshot(),
      funnel: { week: { start: "2026-07-13", end: "2026-07-19" }, current: { intent: 1, rental: { input: 1, confirm: 1, pending: 1, complete: 1 }, program: { input: 1, confirm: 1, pending: 1, complete: 1 } }, prior: { intent: 0, rental: { input: 0, confirm: 0, pending: 0, complete: 0 }, program: { input: 0, confirm: 0, pending: 0, complete: 0 } }, capture: { ga4Complete: 2, selfBooked: 1, rate: 2 } },
    };
    expect(parseSnapshot(JSON.stringify(validSnapshot())).funnel).toBeUndefined();
    expect(parseSnapshot(JSON.stringify(withFunnel)).funnel?.capture.rate).toBe(2);
  });
  it("不正なseverityとschemaVersionを拒否する", () => {
    expect(snapshotSchema.safeParse({ ...validSnapshot(), schemaVersion: 2 }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...validSnapshot(), insights: [{ id: "x", detector: "d", severity: "bad" }] }).success).toBe(false);
  });
  it("実在しない日付・逆転した収録範囲・不正なISO日時を拒否する", () => {
    expect(snapshotSchema.safeParse({ ...validSnapshot(), coverage: { start: "2026-02-30", end: "2026-07-16" } }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...validSnapshot(), coverage: { start: "2026-07-17", end: "2026-07-16" } }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...validSnapshot(), generatedAt: "日時" }).success).toBe(false);
  });
  it("不正なJSONを日本語エラーにする", () => expect(() => parseSnapshot("{")).toThrow("スナップショットJSON"));
  it("妥当JSONを型付きスナップショットへ変換し、構造不正は日本語エラーにする", () => {
    expect(parseSnapshot(JSON.stringify(validSnapshot())).kpi.self.smartphone4w).toBe(1);
    expect(() => parseSnapshot(JSON.stringify({ schemaVersion: 1 }))).toThrow("スナップショットの形式");
  });
});
