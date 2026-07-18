import { jstYmdOfIso } from "./reservationAggregates";
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

export interface FunnelStageView {
  label: string;
  rental: number;
  program: number;
  total: number;
  widthPct: number;
  retentionPct: number | null;
}

export interface FunnelView {
  week: string;
  stages: FunnelStageView[];
  capture: { text: string; isAlert: boolean };
  note: string;
}

export interface ProgramListItem { title: string; schedule: string; fill: string; state: "full" | "warn" | "open" | "unknown"; }
export interface MoneyExtraView { unpaid: { headline: string; overdue: string | null } | null; paymentShare: { method: string; pct: number }[]; revPach: string | null; }

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
  const sourceSyncedYmd = jstYmdOfIso(snapshot.meta.sourceSyncedAt);
  const daysOld = daysBetween(sourceSyncedYmd, todayYmd);
  return { level: daysOld > 7 ? "stale" : "fresh", daysOld, sourceSyncedYmd };
}

/** 対象週の範囲を「MM/DD〜MM/DD」の短い表記にする。 */
function shortWeekOf(range: { start: string; end: string }): string {
  const short = (ymd: string) => ymd.slice(5).replace("-", "/");
  return `${short(range.start)}〜${short(range.end)}`;
}

export function kpiCards(snapshot: Snapshot): KpiCard[] {
  const { actual, self, sales } = snapshot.kpi;
  const targetWeek = shortWeekOf(snapshot.analysis.currentWeek);
  const selfRate = self.total4w === 0 ? null : Math.round((self.selfCount4w / self.total4w) * 100);
  const hasUnknownChannel = self.unknown4w > 0 || snapshot.meta.warnings.some((warning) => warning.includes("予約方法"));
  return [
    { label: `実予約（${targetWeek}）`, value: count(actual.currentWeek), sub: `累積 ${count(actual.cumulative)}・${sampleNote(actual.currentWeek)}` },
    { label: "セルフ予約比率", value: hasUnknownChannel ? "要確認" : selfRate === null ? "収集中" : `${selfRate}%`, sub: hasUnknownChannel ? `未知の予約方法が含まれます(${count(self.unknown4w)})` : selfRate === null ? "対象データを待っています" : `${self.selfCount4w.toLocaleString("ja-JP")}/${count(self.total4w)}・${sampleNote(self.total4w)}` },
    { label: `売上（${targetWeek}）`, value: yen(sales.currentWeek), sub: sales.currentWeek === null ? "売上CSVを待っています" : `28日見込み ${yen(sales.forecast28)}` },
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

/** 予約導線の集計値を、経営ボードのファネル表示用に整形する。 */
export function funnelView(snapshot: Snapshot): FunnelView | null {
  const funnel = snapshot.funnel;
  if (funnel === undefined || funnel === null) return null;

  const stage = (label: string, rental: number, program: number) => ({ label, rental, program, total: rental + program });
  const { current, capture } = funnel;
  const rawStages = [
    { label: "予約クリック", rental: 0, program: 0, total: current.intent },
    stage("情報入力", current.rental.input, current.program.input),
    stage("内容確認", current.rental.confirm, current.program.confirm),
  ];
  const pending = stage("仮予約", current.rental.pending, current.program.pending);
  if (pending.total > 0) rawStages.push(pending);
  rawStages.push(stage("予約完了", current.rental.complete, current.program.complete));
  // rawStages は必ず先頭「予約クリック」を含むため、先頭・直前段の存在は保証される。
  const firstTotal = (rawStages[0] as { total: number }).total;
  const stages: FunnelStageView[] = rawStages.map((stage, index) => {
    const previousTotal = index === 0 ? null : (rawStages[index - 1] as { total: number }).total;
    return {
      ...stage,
      widthPct: index === 0 ? (firstTotal === 0 ? 0 : 100) : firstTotal === 0 ? 0 : Math.round((stage.total / firstTotal) * 100),
      retentionPct: previousTotal === null || previousTotal === 0
        ? null
        : Math.round((stage.total / previousTotal) * 100),
    };
  });

  const captureView = capture.rate === null
    ? { text: "セルフ予約0件のため捕捉率は算出不可", isAlert: false }
    : { text: `捕捉率 ${Math.round(capture.rate * 100)}%(GA4完了${capture.ga4Complete}件 ÷ セルフ予約${capture.selfBooked}件)`, isAlert: capture.rate < 0.5 };
  return {
    week: shortWeekOf(funnel.week),
    stages,
    capture: captureView,
    note: "実予約の真値はKPIヘッダー(CSV由来)。GA4は参考値(捕捉率つき)",
  };
}

export function programList(snapshot: Snapshot): ProgramListItem[] {
  return (snapshot.catalog.programFills ?? []).map((program) => {
    if (program.capacity === null) return { title: program.name, schedule: `${program.heldOn} ${program.start}`, fill: "—", state: "unknown" };
    const state = program.fillRate !== null && program.fillRate >= 1 ? "full" : program.fillRate !== null && program.fillRate < 0.34 ? "warn" : "open";
    return { title: program.name, schedule: `${program.heldOn} ${program.start}`, fill: `${program.reserved}/${program.capacity}`, state };
  });
}

export function moneyExtra(snapshot: Snapshot): MoneyExtraView {
  const aging = snapshot.catalog.unpaidAging;
  const overdue = aging?.buckets.find((bucket) => bucket.label === "15日以上");
  const methods = snapshot.catalog.paymentMethods ?? [];
  const total = methods.reduce((sum, method) => sum + method.count, 0);
  return {
    unpaid: aging === undefined || aging === null ? null : { headline: `${aging.count}件 ${yen(aging.amount)}`, overdue: overdue !== undefined && overdue.count > 0 ? `15日以上 ${yen(overdue.amount)}(${overdue.count}件)` : null },
    paymentShare: total === 0 ? [] : methods.map((method) => ({ method: method.method, pct: Math.round((method.count / total) * 100) })),
    revPach: snapshot.catalog.revPach === undefined || snapshot.catalog.revPach === null ? null : yen(Math.round(snapshot.catalog.revPach.revPerCourtHour)),
  };
}

export function demographicsView(snapshot: Snapshot): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const cell of snapshot.catalog.demographics ?? []) {
    const label = `${cell.ageBand} ${cell.gender}`;
    counts.set(label, (counts.get(label) ?? 0) + cell.count);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count).slice(0, 8);
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
  program: "プログラムデータ",
  blocked: "予約不可データ",
};

export function collectingSections(snapshot: Snapshot): string[] {
  const missing = snapshot.meta.missingSections.map((section) => COLLECTING_LABELS[section] ?? section);
  return [...missing, "ペースカーブはP4で解禁"];
}
