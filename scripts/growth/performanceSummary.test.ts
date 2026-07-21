// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  MIN_JUDGED_ARTICLES_PER_TYPE,
  QUERY_MIN_CLICKS,
  QUERY_MIN_IMPRESSIONS,
  renderPerformanceSummary,
  summarizeArticlePerformance,
} from "./performanceSummary";

import type { ArticleMetrics, SearchQueryStat } from "./metrics";
import type { NotionPage } from "./notion";

function select(name: string) {
  return { type: "select", select: { name } };
}

function metricsJson(overrides: Partial<ArticleMetrics> = {}): string {
  return JSON.stringify({
    pagePath: "/news/x",
    views: { current: 100, prior: 0, deltaPct: null },
    users: { current: 80, prior: 0, deltaPct: null },
    period: { start: "2026-07-06", end: "2026-07-12" },
    ...overrides,
  } satisfies ArticleMetrics);
}

function searchMetrics(topQueries: SearchQueryStat[], impressions = 500): NonNullable<ArticleMetrics["search"]> {
  return {
    clicks: { current: 10, prior: 0, deltaPct: null },
    impressions: { current: impressions, prior: 0, deltaPct: null },
    ctr: { current: 0.02, prior: 0, deltaPct: null },
    position: { current: 8, prior: 0, deltaPct: null },
    topQueries,
  };
}

function query(query: string, clicks: number, impressions: number): SearchQueryStat {
  return { query, clicks, impressions, ctr: impressions === 0 ? 0 : clicks / impressions, position: 6 };
}

function ideaPage(opts: {
  id: string;
  status?: string;
  articleType?: string;
  verdict?: string;
  metrics?: string;
}): NotionPage {
  const properties: Record<string, unknown> = { "ステータス": select(opts.status ?? "公開済み") };
  if (opts.articleType) properties["記事タイプ"] = select(opts.articleType);
  if (opts.verdict) properties["公開後判定"] = select(opts.verdict);
  if (opts.metrics !== undefined) {
    properties["成績データ"] = { type: "rich_text", rich_text: [{ plain_text: opts.metrics }] };
  }
  return { id: opts.id, url: `https://notion.so/${opts.id}`, properties };
}

function summaryFor(
  summaries: ReturnType<typeof summarizeArticlePerformance>,
  articleType: string
) {
  const summary = summaries.find((candidate) => candidate.articleType === articleType);
  if (!summary) throw new Error(`summary not found: ${articleType}`);
  return summary;
}

describe("summarizeArticlePerformance", () => {
  it("公開済みだけを固定記事タイプ順で集計し、欠落と未知値を末尾へ置く", () => {
    const summaries = summarizeArticlePerformance([
      ideaPage({ id: "unknown-z", articleType: "未知Z", verdict: "成功" }),
      ideaPage({ id: "asset", articleType: "資産", verdict: "様子見" }),
      ideaPage({ id: "acquisition", articleType: "獲得", verdict: "要改稿" }),
      ideaPage({ id: "unset", verdict: "未判定" }),
      ideaPage({ id: "unknown-a", articleType: "未知A", verdict: "成功" }),
      ideaPage({ id: "draft", status: "承認", articleType: "不安解消", verdict: "成功" }),
    ]);
    expect(summaries.map((summary) => summary.articleType)).toEqual([
      "獲得", "不安解消", "資産", "比較", "イベント", "タイプ未設定", "未知A", "未知Z",
    ]);
    expect(summaries[0]).toMatchObject({ success: 0, watch: 0, rewrite: 1, judged: 1, unjudged: 0 });
    expect(summaryFor(summaries, "資産")).toMatchObject({ success: 0, watch: 1, rewrite: 0, judged: 1 });
    expect(summaryFor(summaries, "タイプ未設定").unjudged).toBe(1);
  });

  it("成功率は判定済みだけを分母に小数第1位で丸め、3本を母数境界にする", () => {
    const pages = Array.from({ length: 20 }, (_, index) => ideaPage({
      id: `rate-${index}`,
      articleType: "不安解消",
      verdict: index < 2 ? "成功" : "未判定",
    }));
    const exploring = summaryFor(summarizeArticlePerformance(pages), "不安解消");
    expect(MIN_JUDGED_ARTICLES_PER_TYPE).toBe(3);
    expect(exploring).toMatchObject({
      published: 20,
      judged: 2,
      success: 2,
      successRatePct: 100,
      unjudged: 18,
      unjudgedRatePct: 90,
      sampleStatus: "exploring",
    });
    const sufficient = summaryFor(summarizeArticlePerformance([
      ...pages,
      ideaPage({ id: "boundary", articleType: "不安解消", verdict: "様子見" }),
    ]), "不安解消");
    expect(sufficient).toMatchObject({ judged: 3, successRatePct: 66.7, sampleStatus: "sufficient" });
  });

  it("5/20と2/2を成功本数順にせず固定タイプ順で返す", () => {
    const acquisition = Array.from({ length: 2 }, (_, index) =>
      ideaPage({ id: `acquisition-${index}`, articleType: "獲得", verdict: "成功" })
    );
    const reassurance = Array.from({ length: 20 }, (_, index) =>
      ideaPage({
        id: `reassurance-${index}`,
        articleType: "不安解消",
        verdict: index < 5 ? "成功" : "様子見",
      })
    );
    const summaries = summarizeArticlePerformance([...reassurance, ...acquisition]);
    expect(summaries.filter(({ published }) => published > 0).map(({ articleType, success, judged }) => ({ articleType, success, judged }))).toEqual([
      { articleType: "獲得", success: 2, judged: 2 },
      { articleType: "不安解消", success: 5, judged: 20 },
    ]);
  });

  it("公開実績が獲得だけでも未公開の既知4型をゼロサンプルの探索候補として返す", () => {
    const summaries = summarizeArticlePerformance([
      ideaPage({ id: "a", articleType: "獲得", verdict: "成功" }),
      ideaPage({ id: "b", articleType: "獲得", verdict: "様子見" }),
      ideaPage({ id: "c", articleType: "獲得", verdict: "要改稿" }),
    ]);
    expect(summaries.map((summary) => summary.articleType)).toEqual([
      "獲得", "不安解消", "資産", "比較", "イベント",
    ]);
    expect(summaries.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          published: 0,
          judged: 0,
          successRatePct: null,
          unjudgedRatePct: 0,
          sampleStatus: "exploring",
        }),
      ])
    );
  });

  it("判定済み0本では成功率をnullにする", () => {
    const summary = summaryFor(
      summarizeArticlePerformance([ideaPage({ id: "none", articleType: "比較" })]),
      "比較"
    );
    expect(summary).toMatchObject({ judged: 0, successRatePct: null, unjudgedRatePct: 100 });
  });

  it("公開日・期間・GA4/GSCを独立した観測条件として集計する", () => {
    const nowMs = Date.parse("2026-07-16T00:00:00.000Z");
    const search = searchMetrics([], 100);
    const [summary] = summarizeArticlePerformance([
      ideaPage({ id: "seven", articleType: "獲得", metrics: metricsJson({ publishedAt: "2026-07-09T00:00:00.000Z", views: { current: 0, prior: 0, deltaPct: null }, measurementStatus: "path-unmatched", search }) }),
      ideaPage({ id: "ninety", articleType: "獲得", metrics: metricsJson({ publishedAt: "2026-04-17T00:00:00.000Z", views: { current: 800, prior: 0, deltaPct: null }, measurementStatus: "measured", search: searchMetrics([], 1100) }) }),
      ideaPage({ id: "error", articleType: "獲得", metrics: metricsJson({ publishedAt: "invalid", views: { current: 999, prior: 0, deltaPct: null }, measurementStatus: "source-error" }) }),
      ideaPage({ id: "future", articleType: "獲得", metrics: metricsJson({ publishedAt: "2026-07-17T00:00:00.000Z", period: { start: "bad", end: "2026-07-12" } }) }),
      ideaPage({ id: "reverse", articleType: "獲得", metrics: metricsJson({ period: { start: "2026-07-12", end: "2026-07-06" } }) }),
      ideaPage({ id: "duplicate", articleType: "獲得", metrics: metricsJson() }),
      ideaPage({ id: "broken", articleType: "獲得", metrics: "not-json" }),
    ], nowMs);
    expect(summary.observation).toEqual({
      periods: ["2026-07-06〜2026-07-12"],
      publishedDays: { min: 7, max: 90, knownArticles: 2 },
      views: { total: 1100, measuredArticles: 5 },
      impressions: { total: 1200, measuredArticles: 2 },
    });
  });

  it("公開日・期間・計測JSONがすべて欠落した観測条件を保持する", () => {
    const page = ideaPage({ id: "missing", articleType: "イベント" });
    page.properties["成績データ"] = { type: "rich_text", rich_text: [{}] };
    const summary = summaryFor(summarizeArticlePerformance([page]), "イベント");
    expect(summary.observation).toEqual({
      periods: [],
      publishedDays: null,
      views: { total: 0, measuredArticles: 0 },
      impressions: { total: 0, measuredArticles: 0 },
    });
  });

  it("同一クエリを合算してCTRを再計算し、qualified優先・上位3件で並べる", () => {
    const [summary] = summarizeArticlePerformance([
      ideaPage({ id: "q1", articleType: "獲得", metrics: metricsJson({ search: searchMetrics([
        query("合算", 1, 50), query("99表示", 2, 99), query("100表示1クリック", 1, 100), query("ゼロ", 0, 1000), query(" ", 10, 100),
      ]) }) }),
      ideaPage({ id: "q2", articleType: "獲得", metrics: metricsJson({ search: searchMetrics([
        query("合算", 1, 50), query("qualified大", 20, 100), query("qualified同率b", 2, 100), query("qualified同率a", 2, 100),
      ]) }) }),
    ]);
    expect(QUERY_MIN_IMPRESSIONS).toBe(100);
    expect(QUERY_MIN_CLICKS).toBe(2);
    expect(summary.querySignals).toEqual([
      { query: "qualified大", clicks: 20, impressions: 100, ctr: 0.2, status: "qualified" },
      { query: "qualified同率a", clicks: 2, impressions: 100, ctr: 0.02, status: "qualified" },
      { query: "qualified同率b", clicks: 2, impressions: 100, ctr: 0.02, status: "qualified" },
    ]);
  });

  it("探索中クエリの境界、0表示CTR、クリック・表示・名称の決定順を保つ", () => {
    const summary = summaryFor(summarizeArticlePerformance([
      ideaPage({ id: "q", articleType: "比較", metrics: metricsJson({ search: searchMetrics([
        query("100表示2クリック", 2, 100),
        query("99表示2クリック", 2, 99),
        query("100表示1クリック", 1, 100),
        query("表示なし", 1, 0),
      ]) }) }),
    ]), "比較");
    expect(summary.querySignals).toEqual([
      { query: "100表示2クリック", clicks: 2, impressions: 100, ctr: 0.02, status: "qualified" },
      { query: "99表示2クリック", clicks: 2, impressions: 99, ctr: 2 / 99, status: "exploring" },
      { query: "100表示1クリック", clicks: 1, impressions: 100, ctr: 0.01, status: "exploring" },
    ]);
  });

  it("分離計測済みCTAとfreshな記事帰属実予約だけを合算する", () => {
    const outcome = (current: number): Partial<ArticleMetrics> => ({
      ctaEventsMeasured: true,
      ctaEvents: {
        reservationClick: { current, prior: 1, deltaPct: 0 },
        reserveEntryClick: { current: 1, prior: 1, deltaPct: 0 },
        lineClick: { current: 2, prior: 1, deltaPct: 100 },
        instagramClick: { current: 3, prior: 1, deltaPct: 200 },
        other: { current: 4, prior: 1, deltaPct: 300 },
      },
      actualReservations: {
        state: "available",
        source: "csv",
        syncedAt: "2026-07-15T00:00:00.000Z",
        facility: { current: 10, prior: 5, deltaPct: 100 },
        article: { current, prior: 1, deltaPct: 0 },
      },
    });
    const summary = summaryFor(summarizeArticlePerformance([
      ideaPage({ id: "a", articleType: "獲得", metrics: metricsJson(outcome(2)) }),
      ideaPage({ id: "b", articleType: "獲得", metrics: metricsJson(outcome(3)) }),
    ], Date.parse("2026-07-16T00:00:00.000Z")), "獲得");
    expect(summary.outcomes).toEqual({
      reservationIntent: { current: 7, prior: 4, deltaPct: 75 },
      lineClick: { current: 4, prior: 2, deltaPct: 100 },
      instagramClick: { current: 6, prior: 2, deltaPct: 200 },
      other: { current: 8, prior: 2, deltaPct: 300 },
      actualReservations: { current: 5, prior: 2, deltaPct: 150 },
    });
  });

  it("CTA未計測とfreshでない実予約をnullにし、理由を注記する", () => {
    const actual = (actualReservations: NonNullable<ArticleMetrics["actualReservations"]>) =>
      metricsJson({ actualReservations });
    const summary = summaryFor(summarizeArticlePerformance([
      ideaPage({ id: "none", articleType: "資産", metrics: metricsJson({ ctaEventsMeasured: false }) }),
      ideaPage({ id: "missing", articleType: "資産", metrics: actual({ state: "missing", reason: "read_error", checkedAt: "2026-07-15T00:00:00.000Z" }) }),
      ideaPage({ id: "stale", articleType: "資産", metrics: actual({ state: "available", source: "csv", syncedAt: "2026-06-01T00:00:00.000Z", facility: { current: 1, prior: 0, deltaPct: null }, article: { current: 1, prior: 0, deltaPct: null } }) }),
      ideaPage({ id: "facility", articleType: "資産", metrics: actual({ state: "available", source: "csv", syncedAt: "2026-07-15T00:00:00.000Z", facility: { current: 1, prior: 0, deltaPct: null }, article: null }) }),
    ], Date.parse("2026-07-16T00:00:00.000Z")), "資産");
    expect(summary.outcomes).toEqual({ reservationIntent: null, lineClick: null, instagramClick: null, other: null, actualReservations: null });
    expect(summary.notes).toEqual([
      "実予約欠損（予約意図を代理指標として使用）",
      "実予約データが古い（最終取込 2026-06-01T00:00:00.000Z、予約意図を代理指標として使用）",
      "施設全体の実予約のみ（記事別帰属なし）",
    ]);
  });

  it("公開0本でも既知5型を探索候補として返す", () => {
    for (const summaries of [
      summarizeArticlePerformance([]),
      summarizeArticlePerformance([ideaPage({ id: "draft", status: "承認" })]),
    ]) {
      expect(summaries).toHaveLength(5);
      expect(summaries.every((summary) =>
        summary.published === 0 && summary.sampleStatus === "exploring"
      )).toBe(true);
    }
  });
});

describe("renderPerformanceSummary", () => {
  it("同じ成功率でも様子見中心と要改稿中心の型を判定内訳で区別する", () => {
    const text = renderPerformanceSummary(summarizeArticlePerformance([
      ideaPage({ id: "watch-success", articleType: "獲得", verdict: "成功" }),
      ideaPage({ id: "watch-1", articleType: "獲得", verdict: "様子見" }),
      ideaPage({ id: "watch-2", articleType: "獲得", verdict: "様子見" }),
      ideaPage({ id: "rewrite-success", articleType: "不安解消", verdict: "成功" }),
      ideaPage({ id: "rewrite-1", articleType: "不安解消", verdict: "要改稿" }),
      ideaPage({ id: "rewrite-2", articleType: "不安解消", verdict: "要改稿" }),
    ])).join("\n");
    expect(text).toContain("獲得 [母数条件クリア]: 公開3本 / 判定済み3本 / 成功1本 / 様子見2本 / 要改稿0本 / 成功率33.3%");
    expect(text).toContain("不安解消 [母数条件クリア]: 公開3本 / 判定済み3本 / 成功1本 / 様子見0本 / 要改稿2本 / 成功率33.3%");
  });

  it("率・母数・未判定率・観測条件・検索反応・nullable成果を描画する", () => {
    const summaries = summarizeArticlePerformance([
      ideaPage({ id: "success", articleType: "獲得", verdict: "成功", metrics: metricsJson({
        publishedAt: "2026-07-09T00:00:00.000Z",
        search: searchMetrics([query("母数あり", 2, 100), query("本八幡", 1, 1)], 1200),
        ctaEventsMeasured: true,
        ctaEvents: {
          reservationClick: { current: 0, prior: 0, deltaPct: null },
          reserveEntryClick: { current: 0, prior: 0, deltaPct: null },
          lineClick: { current: 0, prior: 0, deltaPct: null },
          instagramClick: { current: 0, prior: 0, deltaPct: null },
          other: { current: 0, prior: 0, deltaPct: null },
        },
        actualReservations: {
          state: "missing",
          reason: "read_error",
          checkedAt: "2026-07-16T00:00:00.000Z",
        },
      }) }),
      ideaPage({ id: "watch", articleType: "獲得", verdict: "様子見" }),
      ideaPage({ id: "rewrite", articleType: "獲得", verdict: "要改稿" }),
      ideaPage({ id: "unjudged", articleType: "不安解消" }),
    ], Date.parse("2026-07-16T00:00:00.000Z"));
    const text = renderPerformanceSummary(summaries).join("\n");
    expect(text).toContain("獲得 [母数条件クリア]: 公開3本 / 判定済み3本 / 成功1本 / 様子見1本 / 要改稿1本 / 成功率33.3% / 未判定0本 (0%)");
    expect(text).toContain("様子見1本 / 要改稿1本");
    expect(text).toContain("不安解消 [探索中: 判定済み0本 < 3本]");
    expect(text).toContain("公開後7〜7日 (1/3本) / 期間2026-07-06〜2026-07-12 / views 100 (1/3本) / impressions 1200 (1/3本)");
    expect(text).toContain("本八幡 (1click/1imp・CTR 100%・探索中)");
    expect(text).toContain("母数あり (2click/100imp・CTR 2%・母数条件クリア)");
    expect(text).toContain("予約意図 0/0");
    expect(text).toContain("記事帰属実予約 未計測");
    expect(text).toContain("注記: 実予約欠損（予約意図を代理指標として使用）");
    expect(text).toContain("公開後日数 未計測 (0/1本) / 期間未計測");
    expect(text).toContain("成功本数だけで優先しない");
    expect(text).toContain("観測条件が揃わない型は直接比較しない");
    expect(text).not.toContain("勝ったクエリ:");
  });

  it("公開0本の空表示を維持する", () => {
    const text = renderPerformanceSummary(summarizeArticlePerformance([])).join("\n");
    expect(text).toContain("公開済み記事がまだ無い");
    expect(text).toContain("獲得 [探索中: 判定済み0本 < 3本]");
    expect(text).toContain("イベント [探索中: 判定済み0本 < 3本]");
  });
});
