/**
 * 成績ボードの期間スケーリング(#proto・純ロジック)。
 * 基準=7日のメトリクスから 28日/90日の見え方を決定的に作る(外部I/Oなし)。
 */
import type { Metrics, SearchMetrics } from "./types";

export type Range = "7" | "28" | "90";

export const RANGES: { key: Range; label: string }[] = [
  { key: "7", label: "7日" },
  { key: "28", label: "28日" },
  { key: "90", label: "90日" },
];

interface RangeSpec {
  factor: number;
  points: number;
  deltaScale: number;
}

const SPEC: Record<Range, RangeSpec> = {
  "7": { factor: 1, points: 7, deltaScale: 1 },
  "28": { factor: 3.7, points: 14, deltaScale: 0.6 },
  "90": { factor: 10.2, points: 18, deltaScale: 0.4 },
};

/** スパークライン用に系列を目標点数へ伸縮する(長い期間は緩やかな立ち上がりを前置)。 */
function fitSeries(series: number[], points: number): number[] {
  if (series.length === 0) return [];
  if (points <= series.length) return series.slice(series.length - points);
  const lead = points - series.length;
  const first = series[0];
  const out: number[] = [];
  for (let i = 0; i < lead; i += 1) {
    out.push(Math.round(first * (0.5 + (0.5 * i) / lead)));
  }
  return [...out, ...series];
}

export interface RangeMetrics {
  views: number;
  users: number;
  deltaPct: number;
  series: number[];
  search?: SearchMetrics;
}

export function rangeView(m: Metrics, range: Range): RangeMetrics {
  const s = SPEC[range];
  return {
    views: Math.round(m.views * s.factor),
    users: Math.round(m.users * s.factor),
    deltaPct: Math.round(m.deltaPct * s.deltaScale),
    series: fitSeries(m.series, s.points),
    search: m.search
      ? {
          ...m.search,
          clicks: Math.round(m.search.clicks * s.factor),
          impressions: Math.round(m.search.impressions * s.factor),
        }
      : undefined,
  };
}

export interface ReviewLabel {
  text: string;
  tone: "green" | "amber" | "blue" | "red" | "gray";
}

/**
 * 数字の一覧を「次の打ち手」に翻訳する行動ラベル(#計測強化 S3)。複数該当しうるので配列で返す。
 * daysSincePublished を渡すと、公開後28日超で伸びていない記事を「要改稿」にする。
 */
export function reviewLabels(m: RangeMetrics, daysSincePublished?: number): ReviewLabel[] {
  const s = m.search;
  if (!s) return [{ text: "未計測", tone: "gray" }];
  const out: ReviewLabel[] = [];
  if (m.deltaPct >= 20) out.push({ text: "伸びている", tone: "green" });
  if (s.position > 7 && s.position <= 20) out.push({ text: "順位あと少し", tone: "blue" });
  if (s.impressions > 2000 && s.ctr < 2) out.push({ text: "CTRが弱い", tone: "amber" });
  if (m.views > 1000 && s.clicks < s.impressions * 0.02) out.push({ text: "読まれるがCTA弱い", tone: "amber" });
  if (m.deltaPct <= -10 || (daysSincePublished != null && daysSincePublished > 28 && m.deltaPct < 5)) {
    out.push({ text: "要改稿", tone: "red" });
  }
  return out.length ? out : [{ text: "安定", tone: "gray" }];
}
