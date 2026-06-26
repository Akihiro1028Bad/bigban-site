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

import { fetchGa4, type Ga4ReportDef } from "./ga4";
import { getAccessToken } from "./auth";
import { loadGrowthConfig } from "./config";
import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import {
  articlePagePath,
  buildMetricsMirrorProps,
  metricsForPagePath,
} from "./metrics";
import { computeWeeklyPeriods } from "./period";
import {
  queryDataSource,
  updatePageProps,
  type NotionApiOptions,
  type NotionPage,
} from "./notion";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const STATUS_PROP = "ステータス";
const CONTENT_ID_PROP = "下書きID";
const PUBLISHED_STATUS = "公開済み";
// microCMS contentId の許可文字＋長さ上限(draft/eyecatch route と同じ)。不正値・過大値を URL パスに載せない。
const CONTENT_ID_RE = /^[a-z0-9-]{1,64}$/;
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);

// topPages のみ取得すれば足りる(pagePath→表示数/ユーザー数)。
const TOP_PAGES_REPORT: Ga4ReportDef = {
  key: "topPages",
  dimensions: ["pagePath"],
  metrics: ["screenPageViews", "activeUsers"],
  limit: 200,
};

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

/** 公開記事(ステータス=公開済み)のページを取得する。 */
async function publishedPages(options: NotionApiOptions): Promise<NotionPage[]> {
  const { pages } = await queryDataSource(
    IDEA_DS,
    {
      filter: { property: STATUS_PROP, select: { equals: PUBLISHED_STATUS } },
      pageSize: 100,
    },
    options
  );
  return pages;
}

/** microCMS 公開記事を contentId で引いて slug / locale を得る。失敗は null。 */
async function fetchSlugLocale(
  domain: string,
  apiKey: string,
  contentId: string
): Promise<{ slug: string; locale: string } | null> {
  if (!CONTENT_ID_RE.test(contentId)) return null; // 不正な contentId は引かない(URL 汚染防止)。
  const url = `https://${domain}.microcms.io/api/v1/news/${encodeURIComponent(contentId)}`;
  const res = await defaultFetch(url, { headers: { "X-MICROCMS-API-KEY": apiKey } });
  if (!res.ok) return null;
  const body = (await res.json()) as { slug?: string; locale?: string | string[] };
  if (!body.slug) return null;
  const locale = Array.isArray(body.locale) ? (body.locale[0] ?? "ja") : (body.locale ?? "ja");
  return { slug: body.slug, locale };
}

async function notifyLine(text: string): Promise<void> {
  const to = process.env.LINE_GROUP_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!to || !token) return; // LINE 未設定なら通知はスキップ(エラーにしない)。
  await pushTextMessage(to, text, { channelAccessToken: token, fetchFn: defaultFetch });
}

async function main(): Promise<void> {
  const config = loadGrowthConfig(process.env);
  const accessToken = await getAccessToken(config);
  const { current, prior } = computeWeeklyPeriods(new Date());

  const ga4 = await fetchGa4({
    config,
    accessToken,
    current,
    prior,
    reports: [TOP_PAGES_REPORT],
  });
  const rows = ga4.topPages ?? [];

  const options = notionOptions();
  const pages = await publishedPages(options);

  const domain = requireEnv("MICROCMS_SERVICE_DOMAIN");
  const microKey = process.env.MICROCMS_CONTENT_API_KEY ?? process.env.MICROCMS_API_KEY;
  if (!microKey) {
    throw new Error("MICROCMS_CONTENT_API_KEY(または MICROCMS_API_KEY)が未設定です。");
  }

  const nowIso = new Date().toISOString();
  let updated = 0;
  let unmatched = 0;

  for (const page of pages) {
    const contentId = contentIdOf(page);
    if (!contentId) continue;
    const sl = await fetchSlugLocale(domain, microKey, contentId);
    if (!sl) {
      unmatched += 1;
      console.warn(`[metrics] slug 解決失敗: ${titleOf(page)} (contentId=${contentId})`);
      continue;
    }
    const pagePath = articlePagePath(sl.slug, sl.locale);
    const metrics = metricsForPagePath(pagePath, rows, current);
    if (!metrics) {
      unmatched += 1;
      console.warn(`[metrics] GA4 一致なし: ${titleOf(page)} (${pagePath})`);
      continue;
    }
    if (DRYRUN) {
      console.log(`[metrics][dryrun] ${titleOf(page)} ${pagePath} views=${metrics.views.current} users=${metrics.users.current}`);
    } else {
      await updatePageProps(page.id, buildMetricsMirrorProps(metrics, nowIso), options);
    }
    updated += 1;
  }

  const summary = `📊 成績更新: ${updated}件 / 未一致 ${unmatched}件 (期間 ${current.start}〜${current.end})`;
  console.log(summary);
  if (!DRYRUN && updated > 0) {
    await notifyLine(summary);
  }
}

main().catch((error: unknown) => {
  console.error("[metrics] 失敗:", error);
  process.exitCode = 1;
});
