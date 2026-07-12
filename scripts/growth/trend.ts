/**
 * 保存済み週次スナップショットから、直近4週の主要指標系列と移動平均を組み立てる。
 * I/O は持たない。ファイル読みは trend-io.ts で注入する。
 */

import type { MergedMetric, MergedRow } from "./transform";

export type TrendMetricKey =
  | "sessions"
  | "activeUsers"
  | "keyEvents"
  | "clicks"
  | "impressions"
  | "ctr"
  | "position";

export interface SnapshotLike {
  period?: { start?: string; end?: string };
  ga4?: Record<string, MergedRow[]> | null;
  gsc?: Record<string, MergedRow[]> | null;
}

export interface TrendPoint {
  weekEnd: string;
  value: number | null;
}

export interface TrendSeries {
  metric: TrendMetricKey;
  points: TrendPoint[];
  movingAvg: number | null;
  latest: number | null;
}

export interface TrendReport {
  weeks: number;
  series: TrendSeries[];
  note: string;
}

const METRICS = [
  { key: "sessions", source: "ga4" },
  { key: "activeUsers", source: "ga4" },
  { key: "keyEvents", source: "ga4" },
  { key: "clicks", source: "gsc" },
  { key: "impressions", source: "gsc" },
  { key: "ctr", source: "gsc" },
  { key: "position", source: "gsc" },
] as const satisfies ReadonlyArray<{ key: TrendMetricKey; source: "ga4" | "gsc" }>;

function metricValue(row: MergedRow | undefined, key: TrendMetricKey): number | null {
  const metric: MergedMetric | undefined = row?.metrics[key];
  return metric ? metric.current : null;
}

function summaryRow(snapshot: SnapshotLike, source: "ga4" | "gsc"): MergedRow | undefined {
  return snapshot[source]?.summary?.[0];
}

function average(values: readonly (number | null)[]): number | null {
  const nums = values.filter((value): value is number => value !== null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

/** スナップショット配列(順不同可)から直近4週の trend を組む。 */
export function buildTrend(snapshots: readonly SnapshotLike[]): TrendReport {
  const recent = snapshots
    .filter((snapshot): snapshot is SnapshotLike & { period: { end: string } } => {
      return typeof snapshot.period?.end === "string" && snapshot.period.end.length > 0;
    })
    .sort((a, b) => a.period.end.localeCompare(b.period.end))
    .slice(-4);

  const series: TrendSeries[] = METRICS.map(({ key, source }) => {
    const points = recent.map((snapshot) => ({
      weekEnd: snapshot.period.end,
      value: metricValue(summaryRow(snapshot, source), key),
    }));
    return {
      metric: key,
      points,
      movingAvg: average(points.map((point) => point.value)),
      latest: points.at(-1)?.value ?? null,
    };
  });

  const weeks = recent.length;
  const note =
    weeks === 0
      ? "スナップショット未蓄積"
      : weeks < 4
        ? `蓄積${weeks}週・参考値(4週で移動平均が安定)`
        : "直近4週の移動平均";

  return { weeks, series, note };
}
