/**
 * 計測ループ(C4)の純ロジック。GA4 の topPages(pagePath→表示数/ユーザー数)を、
 * 公開記事(microCMS slug/locale から組み立てた pagePath)へ突き合わせる。
 *
 * GA4取得・microCMS読込・Notion書込はCLI側。正準予約データの読込だけは
 * 差し替え可能なI/O境界としてここに置く。
 * 承認画面は Notion ミラー(`成績データ`)を読むだけ(プル型)。
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { aggregateCtaEvents, type CtaEventMetrics } from "./ctaEvents";
import { growthArticleSegment, type GrowthMedia } from "./endpoint";
import { LABOLA_FUNNEL_EVENTS } from "./labolaFunnel";
import { parseCanonicalMeta, parseCanonicalReservationsJsonl } from "./reservations";
import type { MergedRow } from "./transform";
import type { ParsedReservationCsv, ReservationCoverage } from "./reservations";

/** 1指標の今期/前期/前週比。 */
export interface MetricDelta {
  current: number;
  prior: number;
  /** 前週比(%・小数第1位)。prior が 0 のときは null。 */
  deltaPct: number | null;
}

/** 1クエリぶんの検索成績(今期値・上位クエリ表示用)。 */
export interface SearchQueryStat {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** 記事の検索パフォーマンス(GSC・#計測強化 S2)。clicks/impressions/ctr/position は前週比つき。 */
export interface SearchMetrics {
  clicks: MetricDelta;
  impressions: MetricDelta;
  ctr: MetricDelta;
  position: MetricDelta;
  topQueries: SearchQueryStat[];
}

export type ActualReservationMetrics =
  | {
      state: "missing";
      reason: "not_configured" | "read_error" | "invalid" | "coverage_incomplete";
      checkedAt: string;
      coverage?: {
        start: string;
        end: string;
        current: boolean;
        prior: boolean;
      };
    }
  | {
      state: "available";
      source: "csv";
      syncedAt: string;
      facility: MetricDelta;
      article: MetricDelta | null;
    };

export type MeasurementStatus = "measured" | "path-unmatched" | "source-error";
export type CtaEventsMeasurementStatus = "measured" | "partial" | "unmeasured";

/** 正準データセットの読み取りを差し替えるための最小I/O境界。 */
export interface MetricsFs {
  readFile(path: string, encoding: "utf8"): Promise<string>;
}

const defaultMetricsFs: MetricsFs = { readFile };

export interface ReservationCsvSnapshot {
  parsed: ParsedReservationCsv;
  syncedAt: string;
  coverage: ReservationCoverage;
}

/**
 * 正準予約データセットを検証して読み込む。既定I/Oは従来どおりnode:fsだが、
 * テストや他の実行環境では MetricsFs を注入できる。
 */
/** unknownなthrow値をログ用の一行に整形する(両catchで共用し分岐を一元化)。 */
function unknownErrorDetail(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "不明なエラー";
}

export async function loadCanonicalReservations(dataDir: string | undefined, checkedAt: string, fs: MetricsFs = defaultMetricsFs): Promise<ReservationCsvSnapshot | ActualReservationMetrics> {
  if (!dataDir) return { state: "missing", reason: "not_configured", checkedAt };
  try {
    const [jsonl, metaJson] = await Promise.all([
      fs.readFile(join(dataDir, "canonical", "reservations.jsonl"), "utf8"),
      fs.readFile(join(dataDir, "canonical", "meta.json"), "utf8"),
    ]);
    try {
      const meta = parseCanonicalMeta(metaJson);
      const actualDigest = createHash("sha256").update(jsonl).digest("hex");
      if (actualDigest !== meta.reservationsDigest) throw new Error("正準予約データのダイジェストが一致しません");
      return { parsed: parseCanonicalReservationsJsonl(jsonl), syncedAt: meta.sourceSyncedAt, coverage: meta.coverage };
    } catch (error: unknown) {
      console.warn("[metrics] 正準データセットが不正です:", unknownErrorDetail(error));
      return { state: "missing", reason: "invalid", checkedAt };
    }
  } catch (error: unknown) {
    console.warn("[metrics] 正準データセットを読み込めません:", unknownErrorDetail(error));
    return { state: "missing", reason: "read_error", checkedAt };
  }
}

/** 1記事ぶんの成績(承認画面の成績ボードで表示)。 */
export interface ArticleMetrics {
  pagePath: string;
  views: MetricDelta;
  users: MetricDelta;
  /** 後方互換値。新規判断は measurementStatus を正本にする。 */
  ga4Measured?: boolean;
  /** GA4値の正本。未指定の旧JSONは measurementStatusOf で正規化する。 */
  measurementStatus?: MeasurementStatus;
  ctaEvents?: CtaEventMetrics;
  ctaEventsMeasured?: boolean;
  ctaEventsMeasurementStatus?: CtaEventsMeasurementStatus;
  actualReservations?: ActualReservationMetrics;
  // #計測強化 S2: GA4 keyEvents(CTAキーイベント。後方互換のため任意。旧データには無い)。
  keyEvents?: MetricDelta;
  // R6: GA4 keyEvents が実測できる期間の記事か。未指定は未計測扱い(後方互換・安全側)。
  keyEventsMeasured?: boolean;
  // R6: GA4帰属の予約完了。意図CTAとは別バケットで、旧データには無い。
  reserveComplete?: MetricDelta;
  // R6: 予約完了タグを実測できる期間の記事か。未指定は未計測扱い(後方互換・安全側)。
  reserveCompleteMeasured?: boolean;
  // #計測強化 S2: GSC 検索成績(後方互換のため任意。旧データには無い)。
  search?: SearchMetrics;
  // #計測強化 S3: 公開日(microCMS publishedAt・ISO)。要改稿(公開28日後)判定に使う。任意・後方互換。
  publishedAt?: string;
  period: { start: string; end: string };
}

/** Notion 記事ネタ案DB に事前追加が必要なミラー用プロパティ名。 */
export const METRICS_PROPS = {
  data: "成績データ",
  updatedAt: "成績更新時刻",
} as const;

const VIEWS_METRIC = "screenPageViews";
const USERS_METRIC = "activeUsers";
const KEY_EVENTS_METRIC = "keyEvents";
const EVENT_COUNT_METRIC = "eventCount";
const RESERVE_COMPLETE_EVENTS: ReadonlySet<string> = new Set([
  LABOLA_FUNNEL_EVENTS.rental.complete,
  LABOLA_FUNNEL_EVENTS.program.complete,
]);
/** Labola予約完了タグの設置日。環境変数にせず正典として固定する。 */
export const RESERVE_COMPLETE_MEASURED_SINCE = "2026-07-18";

/**
 * 公開記事の GA4 pagePath を組み立てる。ja は接頭辞なし、それ以外(en)は /en。
 *
 * URL セグメント(news / columns)は `growthArticleSegment(media, env)` で解決する。
 * #media: news 媒体は常に news、column 媒体は env 従属(columns 切替後は columns)。
 * media 省略時は column=従来挙動。env 未設定時は news = 現行互換。
 * media/env はテスト注入用の引数(既定は column / process.env)。
 */
export function articlePagePath(
  slug: string,
  locale: string,
  media: GrowthMedia = "column",
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const segment = growthArticleSegment(media, env);
  return locale === "ja" ? `/${segment}/${slug}` : `/en/${segment}/${slug}`;
}

/** GA4 pagePath を突き合わせ用に正規化する(クエリ/ハッシュ・末尾スラッシュを除去)。 */
export function normalizePagePath(path: string): string {
  const base = path.split(/[?#]/)[0];
  if (base === "/") return "/";
  return base.replace(/\/+$/, "") || "/";
}

/** 前週比(%・小数第1位)。prior が 0 以下なら null。 */
function deltaPct(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

/** GSC の page フィルタ用に、記事のフル URL を組み立てる(origin の末尾スラッシュは正規化)。 */
export function articleSearchUrl(origin: string, pagePath: string): string {
  return `${origin.replace(/\/+$/, "")}${pagePath}`;
}

/** MergedRow の 1 指標を MetricDelta へ写す(無ければ 0/0/null)。 */
function metricDeltaFrom(row: MergedRow | undefined, name: string): MetricDelta {
  const m = row?.metrics[name];
  return { current: m?.current ?? 0, prior: m?.prior ?? 0, deltaPct: m?.deltaPct ?? null };
}

/**
 * GSC の page フィルタ済みレポートから記事の検索成績を作る(#計測強化 S2)。
 * - summaryRows: dimensions=[] のページ集計(1行。クエリ秘匿の影響を受けない正確な合計)。
 * - queryRows: dimensions=[query] の行。clicks 降順で上位 limit 件を topQueries にする。
 */
export function buildSearchMetrics(
  summaryRows: readonly MergedRow[],
  queryRows: readonly MergedRow[],
  limit = 5
): SearchMetrics {
  const summary = summaryRows[0];
  const topQueries: SearchQueryStat[] = [...queryRows]
    .sort((a, b) => (b.metrics.clicks?.current ?? 0) - (a.metrics.clicks?.current ?? 0))
    .slice(0, limit)
    .map((r) => ({
      query: r.keys[0] ?? "",
      clicks: r.metrics.clicks?.current ?? 0,
      impressions: r.metrics.impressions?.current ?? 0,
      ctr: r.metrics.ctr?.current ?? 0,
      position: r.metrics.position?.current ?? 0,
    }));
  return {
    clicks: metricDeltaFrom(summary, "clicks"),
    impressions: metricDeltaFrom(summary, "impressions"),
    ctr: metricDeltaFrom(summary, "ctr"),
    position: metricDeltaFrom(summary, "position"),
    topQueries,
  };
}

/**
 * pagePath に一致する GA4 行(クエリ違いで分割されることがあるので合算)から成績を作る。
 * 一致が無ければ null。
 */
export function metricsForPagePath(
  pagePath: string,
  rows: readonly MergedRow[],
  period: { start: string; end: string },
  ctaRows?: readonly MergedRow[]
): ArticleMetrics | null {
  const target = normalizePagePath(pagePath);
  const matching = rows.filter((r) => normalizePagePath(r.keys[0] ?? "") === target);
  if (matching.length === 0) return null;

  let viewsC = 0;
  let viewsP = 0;
  let usersC = 0;
  let usersP = 0;
  for (const r of matching) {
    viewsC += r.metrics[VIEWS_METRIC]?.current ?? 0;
    viewsP += r.metrics[VIEWS_METRIC]?.prior ?? 0;
    usersC += r.metrics[USERS_METRIC]?.current ?? 0;
    usersP += r.metrics[USERS_METRIC]?.prior ?? 0;
  }
  const ctaEvents = ctaEventsForPagePath(target, ctaRows);
  return {
    pagePath: target,
    views: { current: viewsC, prior: viewsP, deltaPct: deltaPct(viewsC, viewsP) },
    users: { current: usersC, prior: usersP, deltaPct: deltaPct(usersC, usersP) },
    measurementStatus: "measured",
    ...(ctaEvents ? { ctaEvents } : {}),
    period,
  };
}

/**
 * landingPage を記事パスへ正規化し、Labolaのレンタル/プログラム予約完了を合算する。
 * 予約意図CTAとは別レポートの eventCount を使い、keyEventsとは混同しない。
 */
export function reserveCompleteForPagePath(
  pagePath: string,
  rows: readonly MergedRow[]
): MetricDelta {
  const target = normalizePagePath(pagePath);
  let current = 0;
  let prior = 0;
  for (const row of rows) {
    if (normalizePagePath(row.keys[0] ?? "") !== target) continue;
    if (!RESERVE_COMPLETE_EVENTS.has(row.keys[1] ?? "")) continue;
    current += row.metrics[EVENT_COUNT_METRIC]?.current ?? 0;
    prior += row.metrics[EVENT_COUNT_METRIC]?.prior ?? 0;
  }
  return { current, prior, deltaPct: deltaPct(current, prior) };
}

function ctaEventsForPagePath(
  target: string,
  ctaRows: readonly MergedRow[] | undefined
): CtaEventMetrics | undefined {
  if (!ctaRows) return undefined;
  const matching = ctaRows.filter(
    (row) => normalizePagePath(row.keys[0] ?? "") === target
  );
  return aggregateCtaEvents(
    matching.map((row) => ({
      eventName: row.keys[1] ?? "",
      current: row.metrics[KEY_EVENTS_METRIC]?.current ?? 0,
      prior: row.metrics[KEY_EVENTS_METRIC]?.prior ?? 0,
    }))
  );
}

/**
 * microCMSで解決済みの既知記事を、GA4 topPages一致の有無にかかわらず成績モデルへ載せる。
 * path-unmatched の0は改稿対象、source-error の0は集計・判断対象外のplaceholder。
 */
export function metricsForKnownPagePath(
  pagePath: string,
  rows: readonly MergedRow[],
  period: { start: string; end: string },
  ctaRows?: readonly MergedRow[],
  options: {
    isGa4SourceAvailable?: boolean;
    reserveCompleteRows?: readonly MergedRow[];
  } = {}
): ArticleMetrics {
  const isGa4SourceAvailable = options.isGa4SourceAvailable ?? true;
  if (!isGa4SourceAvailable) {
    return zeroMetrics(pagePath, period, "source-error", ctaRows, options.reserveCompleteRows);
  }
  const measured = metricsForPagePath(pagePath, rows, period, ctaRows);
  if (measured) {
    const reserveComplete = options.reserveCompleteRows
      ? reserveCompleteForPagePath(pagePath, options.reserveCompleteRows)
      : undefined;
    return {
      ...measured,
      ga4Measured: true,
      measurementStatus: "measured",
      ...(reserveComplete ? { reserveComplete } : {}),
    };
  }
  return zeroMetrics(pagePath, period, "path-unmatched", ctaRows, options.reserveCompleteRows);
}

function zeroMetrics(
  pagePath: string,
  period: { start: string; end: string },
  measurementStatus: Exclude<MeasurementStatus, "measured">,
  ctaRows: readonly MergedRow[] | undefined,
  reserveCompleteRows: readonly MergedRow[] | undefined
): ArticleMetrics {
  const target = normalizePagePath(pagePath);
  const ctaEvents = ctaEventsForPagePath(target, ctaRows);
  const reserveComplete = reserveCompleteRows
    ? reserveCompleteForPagePath(target, reserveCompleteRows)
    : undefined;
  return {
    pagePath: target,
    views: { current: 0, prior: 0, deltaPct: null },
    users: { current: 0, prior: 0, deltaPct: null },
    ga4Measured: false,
    measurementStatus,
    ...(ctaEvents ? { ctaEvents } : {}),
    ...(reserveComplete ? { reserveComplete } : {}),
    period,
  };
}

/** 新状態を正本とし、旧JSONは安全側に正規化する。 */
export function measurementStatusOf(
  metrics: Pick<ArticleMetrics, "measurementStatus" | "ga4Measured"> | {
    measurementStatus?: MeasurementStatus;
    ga4Measured?: boolean;
  }
): MeasurementStatus {
  if (metrics.measurementStatus) return metrics.measurementStatus;
  return metrics.ga4Measured === false ? "source-error" : "measured";
}

function ymdTime(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

/** CTAイベント設定日とレポート期間の重なりから計測状態を決める。 */
export function ctaEventsMeasurementStatusForPeriod(
  period: { start: string; end: string } | undefined,
  sinceYmd: string | undefined,
  isGa4SourceAvailable: boolean
): CtaEventsMeasurementStatus {
  if (!isGa4SourceAvailable || !period) return "unmeasured";
  const start = ymdTime(period.start);
  const end = ymdTime(period.end);
  const since = ymdTime(sinceYmd);
  if (start === null || end === null || since === null || start > end) return "unmeasured";
  if (end < since) return "unmeasured";
  return start >= since ? "measured" : "partial";
}

export function ctaEventsMeasurementStatusOf(
  metrics: Pick<ArticleMetrics, "ctaEventsMeasurementStatus" | "ctaEventsMeasured">
): CtaEventsMeasurementStatus {
  if (metrics.ctaEventsMeasurementStatus) return metrics.ctaEventsMeasurementStatus;
  return metrics.ctaEventsMeasured === true ? "measured" : "unmeasured";
}

/** 予約完了タグ設置日以降の全期間だけを計測済みとする。部分期間は安全側で未計測。 */
export function reserveCompleteMeasuredForPeriod(
  period: { start: string; end: string } | undefined,
  isGa4SourceAvailable: boolean
): boolean {
  return ctaEventsMeasurementStatusForPeriod(
    period,
    RESERVE_COMPLETE_MEASURED_SINCE,
    isGa4SourceAvailable
  ) === "measured";
}

export type MeasurementBucket = MeasurementStatus | "zero-inflow";

export function measurementBucketOf(metrics: {
  measurementStatus?: MeasurementStatus;
  ga4Measured?: boolean;
  views: { current: number };
}): MeasurementBucket {
  const status = measurementStatusOf(metrics);
  if (status !== "measured") return status;
  return metrics.views.current === 0 ? "zero-inflow" : "measured";
}

export interface MetricsNotificationCounts {
  updated: number;
  slugFailed: number;
  sourceError: number;
  pathUnmatched: number;
  zeroInflow: number;
  gscFailed: number;
}

export function buildMetricsNotificationSummary(
  counts: MetricsNotificationCounts,
  period: { start: string; end: string }
): string {
  return `📊 成績更新: ${counts.updated}件 / slug失敗 ${counts.slugFailed}件 / GA4失敗 ${counts.sourceError}件 / パス不一致 ${counts.pathUnmatched}件 / 0流入 ${counts.zeroInflow}件 / GSC失敗 ${counts.gscFailed}件 (期間 ${period.start}〜${period.end})`;
}

const deltaSchema = z.object({
  current: z.number(),
  prior: z.number(),
  deltaPct: z.number().nullable(),
});

const searchQuerySchema = z.object({
  query: z.string(),
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number(),
});

const searchSchema = z.object({
  clicks: deltaSchema,
  impressions: deltaSchema,
  ctr: deltaSchema,
  position: deltaSchema,
  topQueries: z.array(searchQuerySchema),
});

const ctaEventsSchema = z.object({
  reservationClick: deltaSchema,
  reserveEntryClick: deltaSchema,
  lineClick: deltaSchema,
  instagramClick: deltaSchema,
  other: deltaSchema,
});

const actualReservationsSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("missing"),
    reason: z.enum(["not_configured", "read_error", "invalid", "coverage_incomplete"]),
    checkedAt: z.string(),
    coverage: z.object({
      start: z.string(),
      end: z.string(),
      current: z.boolean(),
      prior: z.boolean(),
    }).optional(),
  }),
  z.object({
    state: z.literal("available"),
    source: z.literal("csv"),
    syncedAt: z.string(),
    facility: deltaSchema,
    article: deltaSchema.nullable(),
  }),
]);

const metricsSchema = z.object({
  pagePath: z.string(),
  views: deltaSchema,
  users: deltaSchema,
  ga4Measured: z.boolean().optional(),
  measurementStatus: z.enum(["measured", "path-unmatched", "source-error"]).optional(),
  ctaEvents: ctaEventsSchema.optional(),
  ctaEventsMeasured: z.boolean().optional(),
  ctaEventsMeasurementStatus: z.enum(["measured", "partial", "unmeasured"]).optional(),
  actualReservations: actualReservationsSchema.optional(),
  // #計測強化 S2/S3: 後方互換。旧データ(keyEvents/search/publishedAt 無し)も valid のまま。
  keyEvents: deltaSchema.optional(),
  keyEventsMeasured: z.boolean().optional(),
  reserveComplete: deltaSchema.optional(),
  reserveCompleteMeasured: z.boolean().optional(),
  search: searchSchema.optional(),
  publishedAt: z.string().optional(),
  period: z.object({ start: z.string(), end: z.string() }),
});

/** ArticleMetrics を Notion 保存用 JSON 文字列にする。 */
export function serializeMetrics(metrics: ArticleMetrics): string {
  return JSON.stringify(metrics);
}

/** Notion `成績データ` の JSON を ArticleMetrics に戻す。不正・空は null(安全側)。 */
export function parseMetrics(json: string): ArticleMetrics | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = metricsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Notion ミラー更新用プロパティ(`成績データ`＋`成績更新時刻`)を作る。 */
export function buildMetricsMirrorProps(
  metrics: ArticleMetrics,
  updatedAtIso: string
): Record<string, unknown> {
  return {
    [METRICS_PROPS.data]: { rich_text: [{ text: { content: serializeMetrics(metrics) } }] },
    [METRICS_PROPS.updatedAt]: { date: { start: updatedAtIso } },
  };
}

/** 成績ボードのヘッダー用集計(計測済み記事の合計・最高表示数)。 */
export function summarizeMetrics(
  items: readonly {
    title: string;
    metrics?: {
      views?: { current?: number };
      users?: { current?: number };
      measurementStatus?: MeasurementStatus;
      ga4Measured?: boolean;
    };
  }[]
): { totalViews: number; totalUsers: number; count: number; top: { title: string; views: number } | null } {
  let totalViews = 0;
  let totalUsers = 0;
  let count = 0;
  let top: { title: string; views: number } | null = null;
  for (const item of items) {
    const metrics = item.metrics;
    if (!metrics) continue;
    const views = metrics.views?.current;
    if (typeof views !== "number") continue;
    if (measurementStatusOf(metrics) === "source-error") continue;
    count += 1;
    totalViews += views;
    totalUsers += metrics.users?.current ?? 0;
    if (!top || views > top.views) top = { title: item.title, views };
  }
  return { totalViews, totalUsers, count, top };
}
