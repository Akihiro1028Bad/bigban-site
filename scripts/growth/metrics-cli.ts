/**
 * 計測ループ(#C4)の決定的オペレーション CLI(常時稼働 PC のスケジュール実行用)。
 *
 *   npm run growth:metrics                # 公開記事の GA4 成績を取得→Notion `成績データ` に書く
 *   GROWTH_DRYRUN=1 npm run growth:metrics # 書き込まず内容だけ表示
 *
 * プル型: GA4 取得・microCMS の slug 解決・Notion 書き込みはこの PC 側 CLI が担い、
 * 承認画面(Vercel)は Notion ミラーを読むだけ。創作要素は無い(claude 不使用・純データ結線)。
 * 純ロジックは metrics.ts でテスト済み。薄い I/O 配線のためカバレッジ対象外。
 *
 * 事前に Notion 記事ネタ案DB へ `成績データ`(テキスト)/`成績更新時刻`(日付)の2プロパティが必要。
 */

import "dotenv/config";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { fetchGa4, type Ga4ReportDef } from "./ga4";
import { fetchGsc, type GscReportDef } from "./gsc";
import { getAccessToken } from "./auth";
import { loadGrowthConfig, type GrowthConfig } from "./config";
import { growthEndpoint, growthMediaForRow } from "./endpoint";
import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import {
  articlePagePath,
  articleSearchUrl,
  buildMetricsMirrorProps,
  buildMetricsNotificationSummary,
  buildSearchMetrics,
  ctaEventsMeasurementStatusForPeriod,
  measurementBucketOf,
  metricsForKnownPagePath,
  type ActualReservationMetrics,
  type SearchMetrics,
} from "./metrics";
import { computeWeeklyPeriods, type DateRange } from "./period";
import {
  updatePageProps,
  type NotionApiOptions,
  type NotionPage,
} from "./notion";
import { queryAllDataSource } from "./notionRepository";
import { CTA_EVENT_NAMES } from "./ctaEvents";
import {
  actualReservationsForPage,
  parseCanonicalMeta,
  parseCanonicalReservationsJsonl,
  type ParsedReservationCsv,
  type ReservationCoverage,
} from "./reservations";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const STATUS_PROP = "ステータス";
const CONTENT_ID_PROP = "下書きID";
const PUBLISHED_STATUS = "公開済み";
// microCMS contentId の許可文字＋長さ上限(draft/eyecatch route と同じ)。不正値・過大値を URL パスに載せない。
const CONTENT_ID_RE = /^[a-z0-9-]{1,64}$/;
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);
const KEY_EVENTS_SINCE = process.env.GROWTH_GA4_KEYEVENTS_SINCE;

// 表示指標とCTAイベント別指標は別レポートで取得し、keyEvents合計を予約と混同しない。
const TOP_PAGES_REPORT: Ga4ReportDef = {
  key: "topPages",
  dimensions: ["pagePath"],
  metrics: ["screenPageViews", "activeUsers"],
  limit: 200,
  includePriorOnly: true,
};
const TOP_PAGE_CTA_EVENTS_REPORT: Ga4ReportDef = {
  key: "topPageCtaEvents",
  dimensions: ["pagePath", "eventName"],
  metrics: ["keyEvents"],
  dimensionFilter: { fieldName: "eventName", values: CTA_EVENT_NAMES },
  limit: 10_000,
  includePriorOnly: true,
};

// #計測強化 S2: 記事ごとの上位クエリ取得件数。
const GSC_TOP_QUERIES = 5;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

/** Notion ページから 下書きID(microCMS contentId)を読む。 */
function contentIdOf(page: NotionPage): string {
  const prop = page.properties[CONTENT_ID_PROP] as
    | { rich_text?: { plain_text?: string }[] }
    | undefined;
  return (prop?.rich_text ?? []).map((r) => r.plain_text ?? "").join("").trim();
}

function titleOf(page: NotionPage): string {
  const prop = page.properties["タイトル案"] as
    | { title?: { plain_text?: string }[] }
    | undefined;
  return (prop?.title ?? []).map((r) => r.plain_text ?? "").join("").trim();
}

/** #media: Notion 行の `媒体` select を読み、GA4/GSC の URL セグメント解決に使う。欠落=column。 */
function mediaOf(page: NotionPage): ReturnType<typeof growthMediaForRow> {
  const prop = page.properties["媒体"] as { select?: { name?: string } | null } | undefined;
  return growthMediaForRow(prop?.select?.name ?? "");
}

/** 公開記事(ステータス=公開済み)のページを取得する。 */
async function publishedPages(options: NotionApiOptions): Promise<NotionPage[]> {
  return queryAllDataSource(
    IDEA_DS,
    {
      filter: { property: STATUS_PROP, select: { equals: PUBLISHED_STATUS } },
    },
    options
  );
}

/**
 * microCMS 公開記事を contentId で引いて slug / locale / publishedAt を得る。失敗は null。
 * #media(レビュー対応): endpoint は行の `媒体` から `growthEndpoint(media)` で解決した値を受ける。
 * news 固定だと columns 切替後(GROWTH_MICROCMS_ENDPOINT=columns)に column 記事の成績が永久に取れない。
 */
async function fetchSlugLocale(
  domain: string,
  apiKey: string,
  endpoint: string,
  contentId: string
): Promise<{ slug: string; locale: string; publishedAt?: string } | null> {
  if (!CONTENT_ID_RE.test(contentId)) return null; // 不正な contentId は引かない(URL 汚染防止)。
  const url = `https://${domain}.microcms.io/api/v1/${endpoint}/${encodeURIComponent(contentId)}`;
  const res = await defaultFetch(url, { headers: { "X-MICROCMS-API-KEY": apiKey } });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    slug?: string;
    locale?: string | string[];
    publishedAt?: string;
  };
  if (!body.slug) return null;
  const locale = Array.isArray(body.locale) ? (body.locale[0] ?? "ja") : (body.locale ?? "ja");
  // #計測強化 S3: 公開日(要改稿=公開28日後 判定に使う)。
  return { slug: body.slug, locale, publishedAt: body.publishedAt };
}

async function notifyLine(text: string): Promise<void> {
  const to = process.env.LINE_GROUP_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!to || !token) return; // LINE 未設定なら通知はスキップ(エラーにしない)。
  await pushTextMessage(to, text, { channelAccessToken: token, fetchFn: defaultFetch });
}

interface ReservationCsvSnapshot {
  parsed: ParsedReservationCsv;
  syncedAt: string;
  coverage: ReservationCoverage;
}

async function loadCanonicalReservations(
  dataDir: string | undefined,
  checkedAt: string
): Promise<ReservationCsvSnapshot | ActualReservationMetrics> {
  if (!dataDir) return { state: "missing", reason: "not_configured", checkedAt };
  try {
    const [jsonl, metaJson] = await Promise.all([
      readFile(join(dataDir, "canonical", "reservations.jsonl"), "utf8"),
      readFile(join(dataDir, "canonical", "meta.json"), "utf8"),
    ]);
    try {
      const meta = parseCanonicalMeta(metaJson);
      return { parsed: parseCanonicalReservationsJsonl(jsonl), syncedAt: meta.generatedAt, coverage: meta.coverage };
    } catch (error) {
      console.warn("[metrics] 正準データセットが不正です:", error);
      return { state: "missing", reason: "invalid", checkedAt };
    }
  } catch (error) {
    console.warn("[metrics] 正準データセットを読み込めません:", error);
    return { state: "missing", reason: "read_error", checkedAt };
  }
}

function isCsvSnapshot(
  value: ReservationCsvSnapshot | ActualReservationMetrics
): value is ReservationCsvSnapshot {
  return "parsed" in value;
}

/**
 * 記事1件の GSC 検索成績(page フィルタの summary＋query を2期間)を取得する。
 * 失敗しても GA4 分の成績は維持したいので、エラーは握って null を返す(沈黙はログで明示)。
 */
async function fetchArticleSearch(
  config: GrowthConfig,
  accessToken: string,
  current: DateRange,
  prior: DateRange,
  pageUrl: string
): Promise<SearchMetrics | null> {
  const reports: GscReportDef[] = [
    {
      key: "articleSummary",
      dimensions: [],
      filters: [{ dimension: "page", expression: pageUrl }],
      includePriorOnly: true,
    },
    {
      key: "articleQueries",
      dimensions: ["query"],
      rowLimit: 25,
      filters: [{ dimension: "page", expression: pageUrl }],
    },
  ];
  try {
    const gsc = await fetchGsc({ config, accessToken, current, prior, reports });
    return buildSearchMetrics(gsc.articleSummary ?? [], gsc.articleQueries ?? [], GSC_TOP_QUERIES);
  } catch (error) {
    console.warn(`[metrics] GSC 取得失敗(検索成績スキップ): ${pageUrl}`, error);
    return null;
  }
}

async function main(): Promise<void> {
  const config = loadGrowthConfig(process.env);
  const { current, prior } = computeWeeklyPeriods(new Date());
  let accessToken: string | null = null;
  try {
    accessToken = await getAccessToken(config);
  } catch (error) {
    console.warn("[metrics] Google認証失敗(GA4/GSCを未取得として継続):", error);
  }
  let rows: Awaited<ReturnType<typeof fetchGa4>>[string] = [];
  let ctaRows: Awaited<ReturnType<typeof fetchGa4>>[string] | undefined;
  let isGa4Available = false;
  if (accessToken) {
    try {
      const ga4 = await fetchGa4({
        config,
        accessToken,
        current,
        prior,
        reports: [TOP_PAGES_REPORT, TOP_PAGE_CTA_EVENTS_REPORT],
      });
      rows = ga4.topPages ?? [];
      ctaRows = ga4.topPageCtaEvents ?? [];
      isGa4Available = true;
    } catch (error) {
      console.warn("[metrics] GA4取得失敗(実予約更新は継続):", error);
    }
  }

  const options = notionOptions();
  const pages = await publishedPages(options);

  const domain = requireEnv("MICROCMS_SERVICE_DOMAIN");
  const microKey = process.env.MICROCMS_API_KEY;
  if (!microKey) {
    throw new Error("MICROCMS_API_KEYが未設定です。");
  }

  const nowIso = new Date().toISOString();
  const reservations = await loadCanonicalReservations(process.env.GROWTH_RESERVATION_DATA_DIR, nowIso);
  let updated = 0;
  let slugFailed = 0;
  let sourceError = 0;
  let pathUnmatched = 0;
  let zeroInflow = 0;
  let gscFailed = 0; // #計測強化 S2: GSC 取得失敗(クォータ枯渇等)の沈黙を防ぐため件数を可視化。

  for (const page of pages) {
    const contentId = contentIdOf(page);
    if (!contentId) continue;
    // #media: 行の 媒体 で microCMS エンドポイントと URL セグメントを揃えて解決する。
    const media = mediaOf(page);
    const sl = await fetchSlugLocale(domain, microKey, growthEndpoint(media), contentId);
    if (!sl) {
      slugFailed += 1;
      console.warn(`[metrics] slug 解決失敗: ${titleOf(page)} (contentId=${contentId})`);
      continue;
    }
    const pagePath = articlePagePath(sl.slug, sl.locale, media);
    const base = metricsForKnownPagePath(pagePath, rows, current, ctaRows, {
      isGa4SourceAvailable: isGa4Available,
    });
    const bucket = measurementBucketOf(base);
    if (bucket === "source-error") sourceError += 1;
    if (bucket === "path-unmatched") {
      pathUnmatched += 1;
      console.warn(`[metrics] GA4 パス不一致: ${titleOf(page)} (${pagePath})`);
    }
    if (bucket === "zero-inflow") zeroInflow += 1;
    // #計測強化 S2: 記事ごとの GSC 検索成績を page フィルタで取得して合成。
    const pageUrl = articleSearchUrl(config.gscSiteUrl, pagePath);
    const search = accessToken
      ? await fetchArticleSearch(config, accessToken, current, prior, pageUrl)
      : null;
    if (search === null) gscFailed += 1; // 失敗は GA4 分を維持しつつ件数だけ数える(沈黙させない)。
    // #計測強化 S3: 公開日(要改稿判定)も載せる。
    const actualReservations: ActualReservationMetrics = isCsvSnapshot(reservations)
      ? actualReservationsForPage({
          ...reservations,
          current,
          prior,
          pagePath,
          checkedAt: nowIso,
        })
      : reservations;
    const ctaEventsMeasurementStatus = ctaEventsMeasurementStatusForPeriod(
      current,
      KEY_EVENTS_SINCE,
      isGa4Available
    );
    const metrics = {
      ...base,
      ctaEventsMeasurementStatus,
      ctaEventsMeasured: ctaEventsMeasurementStatus === "measured",
      actualReservations,
      ...(search ? { search } : {}),
      ...(sl.publishedAt ? { publishedAt: sl.publishedAt } : {}),
    };
    if (DRYRUN) {
      const s = metrics.search;
      console.log(
        `[metrics][dryrun] ${titleOf(page)} ${pagePath} views=${metrics.views.current} users=${metrics.users.current} reservationClicks=${(metrics.ctaEvents?.reservationClick.current ?? 0) + (metrics.ctaEvents?.reserveEntryClick.current ?? 0)}` +
          (s ? ` clicks=${s.clicks.current} ctr=${s.ctr.current} pos=${s.position.current} q=${s.topQueries.length}` : " (GSCなし)")
      );
    } else {
      await updatePageProps(page.id, buildMetricsMirrorProps(metrics, nowIso), options);
    }
    updated += 1;
  }

  const summary = buildMetricsNotificationSummary(
    { updated, slugFailed, sourceError, pathUnmatched, zeroInflow, gscFailed },
    current
  );
  console.log(summary);
  if (!DRYRUN && updated > 0) {
    await notifyLine(summary);
  }
}

main().catch((error: unknown) => {
  console.error("[metrics] 失敗:", error);
  process.exitCode = 1;
});
