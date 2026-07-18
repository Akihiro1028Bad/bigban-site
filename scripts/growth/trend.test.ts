import { describe, expect, it } from "vitest";

import { buildTrend, type SnapshotLike } from "./trend";

function snapshot(
  end: string,
  values: Partial<{
    sessions: number;
    activeUsers: number;
    keyEvents: number;
    reserveComplete: number;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>
): SnapshotLike {
  return {
    period: { start: "2026-06-01", end },
    ga4: {
      summary: [
        {
          keys: [],
          metrics: {
            ...(values.sessions === undefined ? {} : { sessions: { current: values.sessions, prior: 0, deltaPct: null } }),
            ...(values.activeUsers === undefined ? {} : { activeUsers: { current: values.activeUsers, prior: 0, deltaPct: null } }),
            ...(values.keyEvents === undefined ? {} : { keyEvents: { current: values.keyEvents, prior: 0, deltaPct: null } }),
            ...(values.reserveComplete === undefined ? {} : { reserveComplete: { current: values.reserveComplete, prior: 0, deltaPct: null } }),
          },
        },
      ],
    },
    gsc: {
      summary: [
        {
          keys: [],
          metrics: {
            ...(values.clicks === undefined ? {} : { clicks: { current: values.clicks, prior: 0, deltaPct: null } }),
            ...(values.impressions === undefined ? {} : { impressions: { current: values.impressions, prior: 0, deltaPct: null } }),
            ...(values.ctr === undefined ? {} : { ctr: { current: values.ctr, prior: 0, deltaPct: null } }),
            ...(values.position === undefined ? {} : { position: { current: values.position, prior: 0, deltaPct: null } }),
          },
        },
      ],
    },
  };
}

describe("buildTrend", () => {
  it("4週分から週次系列と移動平均を組む", () => {
    const report = buildTrend([
      snapshot("2026-06-21", { sessions: 40, activeUsers: 20, keyEvents: 4, clicks: 8, impressions: 80, ctr: 0.1, position: 6 }),
      snapshot("2026-06-07", { sessions: 10, activeUsers: 5, keyEvents: 1, clicks: 2, impressions: 20, ctr: 0.1, position: 9 }),
      snapshot("2026-06-28", { sessions: 70, activeUsers: 35, keyEvents: 7, clicks: 14, impressions: 140, ctr: 0.1, position: 5 }),
      snapshot("2026-06-14", { sessions: 20, activeUsers: 10, keyEvents: 2, clicks: 4, impressions: 40, ctr: 0.1, position: 8 }),
    ]);

    const sessions = report.series.find((s) => s.metric === "sessions");
    expect(report.weeks).toBe(4);
    expect(report.note).toBe("直近4週の移動平均");
    expect(sessions?.points).toEqual([
      { weekEnd: "2026-06-07", value: 10 },
      { weekEnd: "2026-06-14", value: 20 },
      { weekEnd: "2026-06-21", value: 40 },
      { weekEnd: "2026-06-28", value: 70 },
    ]);
    expect(sessions?.latest).toBe(70);
    expect(sessions?.movingAvg).toBe(35);
  });

  it("蓄積2週なら組める分だけ・note に参考値", () => {
    const report = buildTrend([
      snapshot("2026-06-07", { sessions: 10 }),
      snapshot("2026-06-14", { sessions: 20 }),
    ]);
    const sessions = report.series.find((s) => s.metric === "sessions");
    expect(report.weeks).toBe(2);
    expect(report.note).toContain("蓄積2週");
    expect(report.note).toContain("参考値");
    expect(sessions?.movingAvg).toBe(15);
  });

  it("0件でも落ちず weeks=0", () => {
    const report = buildTrend([]);
    expect(report.weeks).toBe(0);
    expect(report.note).toContain("スナップショット未蓄積");
    expect(report.series.every((s) => s.points.length === 0)).toBe(true);
  });

  it("period 欠落スナップショットはスキップ", () => {
    const report = buildTrend([
      { ga4: null, gsc: null },
      snapshot("2026-06-07", { sessions: 10 }),
    ]);
    expect(report.weeks).toBe(1);
    expect(report.series.find((s) => s.metric === "sessions")?.points).toEqual([
      { weekEnd: "2026-06-07", value: 10 },
    ]);
  });

  it("指標欠落は null(沈黙させない)", () => {
    const report = buildTrend([
      snapshot("2026-06-07", { sessions: 10 }),
      snapshot("2026-06-14", {}),
    ]);
    const sessions = report.series.find((s) => s.metric === "sessions");
    expect(sessions?.points).toEqual([
      { weekEnd: "2026-06-07", value: 10 },
      { weekEnd: "2026-06-14", value: null },
    ]);
    expect(sessions?.latest).toBeNull();
    expect(sessions?.movingAvg).toBe(10);
  });

  it("予約完了のGA4系列を作り、旧データの週は欠測として扱う", () => {
    const report = buildTrend([
      snapshot("2026-07-12", {}),
      snapshot("2026-07-19", { reserveComplete: 3 }),
    ]);
    const reserveComplete = report.series.find((series) => series.metric === "reserveComplete");
    expect(reserveComplete?.points).toEqual([
      { weekEnd: "2026-07-12", value: null },
      { weekEnd: "2026-07-19", value: 3 },
    ]);
    expect(reserveComplete?.movingAvg).toBe(3);
  });

  it("直近4週だけ採る(5件以上でも4件)", () => {
    const report = buildTrend([
      snapshot("2026-06-01", { sessions: 1 }),
      snapshot("2026-06-08", { sessions: 2 }),
      snapshot("2026-06-15", { sessions: 3 }),
      snapshot("2026-06-22", { sessions: 4 }),
      snapshot("2026-06-29", { sessions: 5 }),
    ]);
    expect(report.weeks).toBe(4);
    expect(report.series.find((s) => s.metric === "sessions")?.points).toEqual([
      { weekEnd: "2026-06-08", value: 2 },
      { weekEnd: "2026-06-15", value: 3 },
      { weekEnd: "2026-06-22", value: 4 },
      { weekEnd: "2026-06-29", value: 5 },
    ]);
  });
});
