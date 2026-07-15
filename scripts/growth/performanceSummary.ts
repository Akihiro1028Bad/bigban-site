/** 公開済み記事を記事タイプ別に集計し、週次判断へ渡す純ロジック (#286)。 */

import { combineMetricDeltas, reservationIntent } from "./ctaEvents";
import { METRICS_PROPS, measurementStatusOf, parseMetrics } from "./metrics";
import { isReservationDataFresh } from "./reservations";

import type { MetricDelta, SearchQueryStat } from "./metrics";
import type { NotionPage } from "./notion";

const PUBLISHED_STATUS = "公開済み";
const UNTYPED_BUCKET = "タイプ未設定";
const VERDICT_SUCCESS = "成功";
const VERDICT_WATCH = "様子見";
const VERDICT_REWRITE = "要改稿";
const KNOWN_ARTICLE_TYPE_ORDER = ["獲得", "不安解消", "資産", "比較", "イベント"] as const;
const QUERY_SIGNALS_PER_TYPE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MIN_JUDGED_ARTICLES_PER_TYPE = 3;
export const QUERY_MIN_IMPRESSIONS = 100;
export const QUERY_MIN_CLICKS = 2;

export interface ArticleTypeObservation {
  periods: string[];
  publishedDays: { min: number; max: number; knownArticles: number } | null;
  views: { total: number; measuredArticles: number };
  impressions: { total: number; measuredArticles: number };
}

export interface ArticleTypeQuerySignal {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  status: "qualified" | "exploring";
}

interface ArticleTypeOutcomes {
  reservationIntent: MetricDelta | null;
  lineClick: MetricDelta | null;
  instagramClick: MetricDelta | null;
  other: MetricDelta | null;
  actualReservations: MetricDelta | null;
}

export interface ArticleTypePerformance {
  articleType: string;
  published: number;
  success: number;
  watch: number;
  rewrite: number;
  judged: number;
  unjudged: number;
  successRatePct: number | null;
  unjudgedRatePct: number;
  sampleStatus: "sufficient" | "exploring";
  observation: ArticleTypeObservation;
  querySignals: ArticleTypeQuerySignal[];
  outcomes: ArticleTypeOutcomes;
  notes: string[];
}

interface Bucket {
  published: number;
  success: number;
  watch: number;
  rewrite: number;
  unjudged: number;
  periods: Set<string>;
  publishedDays: number[];
  viewsTotal: number;
  viewsMeasuredArticles: number;
  impressionsTotal: number;
  impressionsMeasuredArticles: number;
  queries: Map<string, { clicks: number; impressions: number }>;
  outcomeValues: {
    reservationIntent: MetricDelta[];
    lineClick: MetricDelta[];
    instagramClick: MetricDelta[];
    other: MetricDelta[];
    actualReservations: MetricDelta[];
  };
  hasCtaMeasurement: boolean;
  hasActualReservationMeasurement: boolean;
  notes: Set<string>;
}

function selectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return (value?.select?.name ?? "").trim();
}

function richTextValue(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
  return (value?.rich_text ?? []).map((text) => text.plain_text ?? "").join("").trim();
}

function newBucket(): Bucket {
  return {
    published: 0,
    success: 0,
    watch: 0,
    rewrite: 0,
    unjudged: 0,
    periods: new Set<string>(),
    publishedDays: [],
    viewsTotal: 0,
    viewsMeasuredArticles: 0,
    impressionsTotal: 0,
    impressionsMeasuredArticles: 0,
    queries: new Map<string, { clicks: number; impressions: number }>(),
    outcomeValues: {
      reservationIntent: [],
      lineClick: [],
      instagramClick: [],
      other: [],
      actualReservations: [],
    },
    hasCtaMeasurement: false,
    hasActualReservationMeasurement: false,
    notes: new Set<string>(),
  };
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function periodLabel(period: { start: string; end: string }): string | null {
  if (!isValidDate(period.start) || !isValidDate(period.end)) return null;
  if (Date.parse(period.start) > Date.parse(period.end)) return null;
  return `${period.start}〜${period.end}`;
}

function publishedDays(publishedAt: string | undefined, nowMs: number): number | null {
  if (!publishedAt) return null;
  const publishedMs = Date.parse(publishedAt);
  if (!Number.isFinite(publishedMs) || publishedMs > nowMs) return null;
  return Math.floor((nowMs - publishedMs) / DAY_MS);
}

function tallyVerdict(bucket: Bucket, verdict: string): void {
  if (verdict === VERDICT_SUCCESS) bucket.success += 1;
  else if (verdict === VERDICT_WATCH) bucket.watch += 1;
  else if (verdict === VERDICT_REWRITE) bucket.rewrite += 1;
  else bucket.unjudged += 1;
}

function accumulateQueries(bucket: Bucket, queries: readonly SearchQueryStat[]): void {
  for (const queryStat of queries) {
    const query = queryStat.query.trim();
    if (!query) continue;
    const current = bucket.queries.get(query) ?? { clicks: 0, impressions: 0 };
    current.clicks += queryStat.clicks;
    current.impressions += queryStat.impressions;
    bucket.queries.set(query, current);
  }
}

function accumulateObservations(bucket: Bucket, page: NotionPage, nowMs: number): void {
  const metrics = parseMetrics(richTextValue(page, METRICS_PROPS.data));
  if (!metrics) return;
  const period = periodLabel(metrics.period);
  if (period) bucket.periods.add(period);
  const age = publishedDays(metrics.publishedAt, nowMs);
  if (age !== null) bucket.publishedDays.push(age);
  if (measurementStatusOf(metrics) !== "source-error") {
    bucket.viewsTotal += metrics.views.current;
    bucket.viewsMeasuredArticles += 1;
  }
  if (metrics.search) {
    bucket.impressionsTotal += metrics.search.impressions.current;
    bucket.impressionsMeasuredArticles += 1;
    accumulateQueries(bucket, metrics.search.topQueries);
  }
}

function accumulateOutcomes(bucket: Bucket, page: NotionPage, nowMs: number): void {
  const metrics = parseMetrics(richTextValue(page, METRICS_PROPS.data));
  if (!metrics) return;
  if (metrics.ctaEvents && metrics.ctaEventsMeasured === true) {
    bucket.hasCtaMeasurement = true;
    bucket.outcomeValues.reservationIntent.push(reservationIntent(metrics.ctaEvents));
    bucket.outcomeValues.lineClick.push(metrics.ctaEvents.lineClick);
    bucket.outcomeValues.instagramClick.push(metrics.ctaEvents.instagramClick);
    bucket.outcomeValues.other.push(metrics.ctaEvents.other);
  }
  const actual = metrics.actualReservations;
  if (!actual) return;
  if (actual.state === "missing") {
    bucket.notes.add("実予約欠損（予約意図を代理指標として使用）");
  } else if (!isReservationDataFresh(actual.syncedAt, new Date(nowMs).toISOString())) {
    bucket.notes.add(`実予約データが古い（最終取込 ${actual.syncedAt}、予約意図を代理指標として使用）`);
  } else if (actual.article === null) {
    bucket.notes.add("施設全体の実予約のみ（記事別帰属なし）");
  } else {
    bucket.hasActualReservationMeasurement = true;
    bucket.outcomeValues.actualReservations.push(actual.article);
  }
}

function combine(values: readonly MetricDelta[]): MetricDelta {
  return combineMetricDeltas(values);
}

function outcomesOf(bucket: Bucket): ArticleTypeOutcomes {
  return {
    reservationIntent: bucket.hasCtaMeasurement ? combine(bucket.outcomeValues.reservationIntent) : null,
    lineClick: bucket.hasCtaMeasurement ? combine(bucket.outcomeValues.lineClick) : null,
    instagramClick: bucket.hasCtaMeasurement ? combine(bucket.outcomeValues.instagramClick) : null,
    other: bucket.hasCtaMeasurement ? combine(bucket.outcomeValues.other) : null,
    actualReservations: bucket.hasActualReservationMeasurement
      ? combine(bucket.outcomeValues.actualReservations)
      : null,
  };
}

function querySignalsOf(queries: ReadonlyMap<string, { clicks: number; impressions: number }>): ArticleTypeQuerySignal[] {
  return [...queries.entries()]
    .filter(([, value]) => value.clicks > 0)
    .map(([query, value]): ArticleTypeQuerySignal => ({
      query,
      clicks: value.clicks,
      impressions: value.impressions,
      ctr: value.impressions === 0 ? 0 : value.clicks / value.impressions,
      status:
        value.impressions >= QUERY_MIN_IMPRESSIONS && value.clicks >= QUERY_MIN_CLICKS
          ? "qualified"
          : "exploring",
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "qualified" ? -1 : 1;
      return b.clicks - a.clicks || b.impressions - a.impressions || a.query.localeCompare(b.query, "ja");
    })
    .slice(0, QUERY_SIGNALS_PER_TYPE);
}

function observationOf(bucket: Bucket): ArticleTypeObservation {
  return {
    periods: [...bucket.periods].sort(),
    publishedDays:
      bucket.publishedDays.length === 0
        ? null
        : {
            min: Math.min(...bucket.publishedDays),
            max: Math.max(...bucket.publishedDays),
            knownArticles: bucket.publishedDays.length,
          },
    views: { total: bucket.viewsTotal, measuredArticles: bucket.viewsMeasuredArticles },
    impressions: {
      total: bucket.impressionsTotal,
      measuredArticles: bucket.impressionsMeasuredArticles,
    },
  };
}

function articleTypeRank(articleType: string): number {
  const knownIndex = KNOWN_ARTICLE_TYPE_ORDER.indexOf(articleType as typeof KNOWN_ARTICLE_TYPE_ORDER[number]);
  if (knownIndex >= 0) return knownIndex;
  return articleType === UNTYPED_BUCKET ? KNOWN_ARTICLE_TYPE_ORDER.length : KNOWN_ARTICLE_TYPE_ORDER.length + 1;
}

export function summarizeArticlePerformance(
  ideas: readonly NotionPage[],
  nowMs = Date.now()
): ArticleTypePerformance[] {
  const buckets = new Map<string, Bucket>();
  for (const page of ideas) {
    if (selectName(page, "ステータス") !== PUBLISHED_STATUS) continue;
    const articleType = selectName(page, "記事タイプ") || UNTYPED_BUCKET;
    const bucket = buckets.get(articleType) ?? newBucket();
    bucket.published += 1;
    tallyVerdict(bucket, selectName(page, "公開後判定"));
    accumulateObservations(bucket, page, nowMs);
    accumulateOutcomes(bucket, page, nowMs);
    buckets.set(articleType, bucket);
  }

  return [...buckets.entries()]
    .sort(([typeA], [typeB]) => articleTypeRank(typeA) - articleTypeRank(typeB) || typeA.localeCompare(typeB, "ja"))
    .map(([articleType, bucket]) => {
      const judged = bucket.success + bucket.watch + bucket.rewrite;
      return {
        articleType,
        published: bucket.published,
        success: bucket.success,
        watch: bucket.watch,
        rewrite: bucket.rewrite,
        judged,
        unjudged: bucket.unjudged,
        successRatePct: judged === 0 ? null : roundOne((bucket.success / judged) * 100),
        unjudgedRatePct: roundOne((bucket.unjudged / bucket.published) * 100),
        sampleStatus: judged < MIN_JUDGED_ARTICLES_PER_TYPE ? "exploring" : "sufficient",
        observation: observationOf(bucket),
        querySignals: querySignalsOf(bucket.queries),
        outcomes: outcomesOf(bucket),
        notes: [...bucket.notes],
      };
    });
}

function metricText(metric: MetricDelta | null): string {
  return metric ? `${metric.current}/${metric.prior}` : "未計測";
}

function observationText(summary: ArticleTypePerformance): string {
  const { observation } = summary;
  const days = observation.publishedDays
    ? `公開後${observation.publishedDays.min}〜${observation.publishedDays.max}日 (${observation.publishedDays.knownArticles}/${summary.published}本)`
    : `公開後日数 未計測 (0/${summary.published}本)`;
  const periods = observation.periods.length > 0 ? observation.periods.join(" / ") : "未計測";
  return `${days} / 期間${periods} / views ${observation.views.total} (${observation.views.measuredArticles}/${summary.published}本) / impressions ${observation.impressions.total} (${observation.impressions.measuredArticles}/${summary.published}本)`;
}

export function renderPerformanceSummary(summaries: readonly ArticleTypePerformance[]): string[] {
  const lines = ["## 公開済み記事の成績サマリ(記事タイプ別・率/母数/観測条件)"];
  if (summaries.reduce((sum, summary) => sum + summary.published, 0) === 0) {
    lines.push("(公開済み記事がまだ無いため成績サマリは空。公開後に率・母数・観測条件を蓄積する)");
    return lines;
  }

  for (const summary of summaries) {
    const status = summary.sampleStatus === "sufficient"
      ? "母数条件クリア"
      : `探索中: 判定済み${summary.judged}本 < ${MIN_JUDGED_ARTICLES_PER_TYPE}本`;
    const successRate = summary.successRatePct === null ? "未算出" : `${summary.successRatePct}%`;
    lines.push(`- ${summary.articleType} [${status}]: 公開${summary.published}本 / 判定済み${summary.judged}本 / 成功${summary.success}本 / 成功率${successRate} / 未判定${summary.unjudged}本 (${summary.unjudgedRatePct}%)`);
    lines.push(`  - 観測条件: ${observationText(summary)}`);
    if (summary.querySignals.length > 0) {
      lines.push(`  - 検索反応: ${summary.querySignals.map((signal) => `${signal.query} (${signal.clicks}click/${signal.impressions}imp・CTR ${roundOne(signal.ctr * 100)}%・${signal.status === "qualified" ? "母数条件クリア" : "探索中"})`).join(" / ")}`);
    }
    lines.push(`  - 成果: 予約意図 ${metricText(summary.outcomes.reservationIntent)}、LINE ${metricText(summary.outcomes.lineClick)}、Instagram ${metricText(summary.outcomes.instagramClick)}、その他CTA ${metricText(summary.outcomes.other)}、記事帰属実予約 ${metricText(summary.outcomes.actualReservations)}`);
    for (const note of summary.notes) lines.push(`  - 注記: ${note}`);
  }
  lines.push("(成功本数だけで優先しない。率・母数・未判定率をセットで読み、観測条件が揃わない型は直接比較しない。判定済み3本未満は探索中で本命確定しない。freshな実予約を優先し、予約意図は代理指標。低サンプル検索反応を成果や「勝ちクエリ」と呼ばない)");
  return lines;
}
