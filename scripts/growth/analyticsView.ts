import type { Insight, Snapshot } from "./snapshotSchema";

export interface FreshnessView {
  level: "fresh" | "stale";
  daysOld: number;
  sourceSyncedYmd: string;
}

export interface KpiCard {
  label: string;
  value: string;
  sub: string;
}

export interface HeatmapCell {
  dow: number;
  slot: string;
  count: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface MoneyView {
  currentWeek: string;
  forecast28: string;
}

function ymdOf(iso: string): string {
  return iso.slice(0, 10);
}

/** ISO日時を経営ボードの最終同期表示用JST文字列にする。 */
export function formatSyncedAtJst(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${jst.toISOString().slice(0, 16).replace("T", " ")} 時点`;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`);
  const to = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

function count(value: number): string {
  return `${value.toLocaleString("ja-JP")}件`;
}

function yen(value: number | null): string {
  return value === null ? "収集中" : `¥${value.toLocaleString("ja-JP")}`;
}

function sampleNote(n: number): string {
  return n < 10 ? "n<10のため参考値" : "4週集計";
}

export function freshnessOf(snapshot: Snapshot, todayYmd: string): FreshnessView {
  const sourceSyncedYmd = ymdOf(snapshot.meta.sourceSyncedAt);
  const daysOld = daysBetween(sourceSyncedYmd, todayYmd);
  return { level: daysOld > 7 ? "stale" : "fresh", daysOld, sourceSyncedYmd };
}

export function kpiCards(snapshot: Snapshot): KpiCard[] {
  const { actual, self, sales } = snapshot.kpi;
  const selfRate = self.total4w === 0 ? null : Math.round((self.selfCount4w / self.total4w) * 100);
  return [
    { label: "実予約（対象週）", value: count(actual.currentWeek), sub: `累積 ${count(actual.cumulative)}・${sampleNote(actual.currentWeek)}` },
    { label: "セルフ予約比率", value: selfRate === null ? "収集中" : `${selfRate}%`, sub: selfRate === null ? "対象データを待っています" : `${count(self.selfCount4w)} / ${count(self.total4w)}・${sampleNote(self.total4w)}` },
    { label: "売上（対象週）", value: yen(sales.currentWeek), sub: sales.currentWeek === null ? "売上CSVを待っています" : `28日見込み ${yen(sales.forecast28)}` },
  ];
}

const SEVERITY_ORDER: Record<Insight["severity"], number> = { alert: 0, notice: 1, info: 2 };

export function sortedInsights(snapshot: Snapshot): Insight[] {
  return [...snapshot.insights].sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return severity !== 0 ? severity : b.firstSeen.localeCompare(a.firstSeen);
  });
}

export function heatmapCells(snapshot: Snapshot): HeatmapCell[] {
  const positives = snapshot.catalog.heatmap.map((cell) => cell.count).filter((value) => value > 0).sort((a, b) => a - b);
  return snapshot.catalog.heatmap.map((cell) => {
    if (cell.count === 0 || positives.length === 0) return { ...cell, intensity: 0 };
    const rank = positives.filter((value) => value <= cell.count).length / positives.length;
    const intensity = Math.min(4, Math.max(1, Math.ceil(rank * 4))) as HeatmapCell["intensity"];
    return { ...cell, intensity };
  });
}

/** 数値を持つスナップショットを、金額パネルがそのまま表示できる文字列にする。 */
export function moneyPanel(snapshot: Snapshot): MoneyView {
  return { currentWeek: yen(snapshot.kpi.sales.currentWeek), forecast28: yen(snapshot.kpi.sales.forecast28) };
}

/** 気づきの根拠をPIIなしの短い表示チップにする。 */
export function insightEvidenceText(evidence: Record<string, unknown>): string | null {
  const chips = Object.entries(evidence)
    .filter(([, value]) => ["string", "number"].includes(typeof value))
    .slice(0, 2)
    .map(([key, value]) => `${key}=${String(value)}`);
  return chips.length > 0 ? chips.join(" / ") : null;
}

const COLLECTING_LABELS: Record<string, string> = {
  customer: "商圏・顧客データ",
  salesSummary: "売上データ",
};

export function collectingSections(snapshot: Snapshot): string[] {
  const missing = snapshot.meta.missingSections.map((section) => COLLECTING_LABELS[section] ?? section);
  return [...missing, "ファネルはP3で解禁", "ペースカーブはP4で解禁"];
}
