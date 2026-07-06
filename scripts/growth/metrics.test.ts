import { describe, expect, it } from "vitest";

import type { MergedRow } from "./transform";
import {
  articlePagePath,
  articleSearchUrl,
  buildMetricsMirrorProps,
  buildSearchMetrics,
  isKeyEventsMeasured,
  type ArticleMetrics,
  metricsForPagePath,
  METRICS_PROPS,
  normalizePagePath,
  parseMetrics,
  type SearchMetrics,
  serializeMetrics,
  summarizeMetrics,
} from "./metrics";

const PERIOD = { start: "2026-06-15", end: "2026-06-21" };

function row(
  pagePath: string,
  views: [number, number],
  users: [number, number],
  keyEvents: [number, number] = [0, 0]
): MergedRow {
  return {
    keys: [pagePath],
    metrics: {
      screenPageViews: { current: views[0], prior: views[1], deltaPct: null },
      activeUsers: { current: users[0], prior: users[1], deltaPct: null },
      keyEvents: { current: keyEvents[0], prior: keyEvents[1], deltaPct: null },
    },
  };
}

describe("articlePagePath", () => {
  it("ja は /news/{slug}(column・env 未設定=現行互換)", () => {
    expect(articlePagePath("spring-open", "ja", "column", {})).toBe("/news/spring-open");
  });
  it("ja 以外(en)は /en/news/{slug}", () => {
    expect(articlePagePath("spring-open", "en", "column", {})).toBe("/en/news/spring-open");
  });
  it("column 媒体で endpoint=columns なら /columns/{slug}", () => {
    expect(
      articlePagePath("spring-open", "ja", "column", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
    ).toBe("/columns/spring-open");
    expect(
      articlePagePath("spring-open", "en", "column", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
    ).toBe("/en/columns/spring-open");
  });
  it("news 媒体は env=columns でも常に /news/{slug}(#media)", () => {
    expect(
      articlePagePath("summer-fair", "ja", "news", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
    ).toBe("/news/summer-fair");
    expect(
      articlePagePath("summer-fair", "en", "news", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
    ).toBe("/en/news/summer-fair");
  });
  it("media 省略時は column 扱い(挙動不変)", () => {
    expect(articlePagePath("spring-open", "ja", undefined, {})).toBe("/news/spring-open");
  });
  it("env 引数省略時は process.env を参照する(column)", () => {
    const prev = process.env.GROWTH_MICROCMS_ENDPOINT;
    try {
      delete process.env.GROWTH_MICROCMS_ENDPOINT;
      expect(articlePagePath("spring-open", "ja", "column")).toBe("/news/spring-open");
      process.env.GROWTH_MICROCMS_ENDPOINT = "columns";
      expect(articlePagePath("spring-open", "ja", "column")).toBe("/columns/spring-open");
      // news 媒体は env を無視。
      expect(articlePagePath("spring-open", "ja", "news")).toBe("/news/spring-open");
    } finally {
      if (prev === undefined) delete process.env.GROWTH_MICROCMS_ENDPOINT;
      else process.env.GROWTH_MICROCMS_ENDPOINT = prev;
    }
  });
});

describe("normalizePagePath", () => {
  it("クエリ・ハッシュを落とす", () => {
    expect(normalizePagePath("/news/a?utm_source=x")).toBe("/news/a");
    expect(normalizePagePath("/news/a#sec")).toBe("/news/a");
  });
  it("末尾スラッシュを落とす(ルートは保持)", () => {
    expect(normalizePagePath("/news/a/")).toBe("/news/a");
    expect(normalizePagePath("/")).toBe("/");
  });
  it("スラッシュのみ・空はルートに倒す", () => {
    expect(normalizePagePath("///")).toBe("/");
    expect(normalizePagePath("")).toBe("/");
  });
  it("素のパスはそのまま", () => {
    expect(normalizePagePath("/news/a")).toBe("/news/a");
  });
});

describe("metricsForPagePath", () => {
  it("一致する行から views/users を取り出す", () => {
    const rows = [row("/news/a", [120, 100], [80, 70]), row("/news/b", [10, 5], [9, 4])];
    const m = metricsForPagePath("/news/a", rows, PERIOD);
    expect(m).not.toBeNull();
    expect(m?.views.current).toBe(120);
    expect(m?.views.prior).toBe(100);
    expect(m?.views.deltaPct).toBe(20);
    expect(m?.users.current).toBe(80);
    expect(m?.pagePath).toBe("/news/a");
    expect(m?.period).toEqual(PERIOD);
  });

  it("クエリ違いで分割された行を合算する", () => {
    const rows = [row("/news/a", [100, 50], [60, 30]), row("/news/a?ref=line", [20, 10], [10, 5])];
    const m = metricsForPagePath("/news/a", rows, PERIOD);
    expect(m?.views.current).toBe(120);
    expect(m?.views.prior).toBe(60);
    expect(m?.users.current).toBe(70);
    expect(m?.views.deltaPct).toBe(100);
  });

  it("keyEvents(CTA)も合算する(#S2)", () => {
    const rows = [row("/news/a", [100, 50], [60, 30], [4, 2]), row("/news/a?ref=line", [20, 10], [10, 5], [1, 0])];
    const m = metricsForPagePath("/news/a", rows, PERIOD);
    expect(m?.keyEvents).toEqual({ current: 5, prior: 2, deltaPct: 150 });
  });

  it("prior が 0 なら deltaPct は null", () => {
    const rows = [row("/news/a", [10, 0], [5, 0])];
    const m = metricsForPagePath("/news/a", rows, PERIOD);
    expect(m?.views.deltaPct).toBeNull();
  });

  it("一致が無ければ null(keys 欠落の行も安全に無視)", () => {
    const rows: MergedRow[] = [
      { keys: [], metrics: {} },
      row("/news/b", [1, 1], [1, 1]),
    ];
    expect(metricsForPagePath("/news/a", rows, PERIOD)).toBeNull();
  });

  it("指標が欠けていても 0 で埋める", () => {
    const rows: MergedRow[] = [{ keys: ["/news/a"], metrics: {} }];
    const m = metricsForPagePath("/news/a", rows, PERIOD);
    expect(m?.views.current).toBe(0);
    expect(m?.users.prior).toBe(0);
    expect(m?.views.deltaPct).toBeNull();
  });
});

describe("serializeMetrics / parseMetrics", () => {
  const metrics: ArticleMetrics = {
    pagePath: "/news/a",
    views: { current: 120, prior: 100, deltaPct: 20 },
    users: { current: 80, prior: 70, deltaPct: 14.3 },
    period: PERIOD,
  };

  it("往復できる", () => {
    expect(parseMetrics(serializeMetrics(metrics))).toEqual(metrics);
  });

  it("空文字・不正 JSON は null(安全側)", () => {
    expect(parseMetrics("")).toBeNull();
    expect(parseMetrics("not json")).toBeNull();
  });

  it("形が違えば null", () => {
    expect(parseMetrics(JSON.stringify({ pagePath: "/news/a" }))).toBeNull();
    expect(parseMetrics(JSON.stringify({ ...metrics, views: { current: "x" } }))).toBeNull();
  });

  it("search ブロック付き(S2)も往復できる", () => {
    const withSearch: ArticleMetrics = {
      ...metrics,
      publishedAt: "2026-06-01T00:00:00.000Z",
      search: {
        clicks: { current: 10, prior: 8, deltaPct: 25 },
        impressions: { current: 200, prior: 150, deltaPct: 33.3 },
        ctr: { current: 0.05, prior: 0.053, deltaPct: -5.7 },
        position: { current: 3.2, prior: 4.1, deltaPct: -22 },
        topQueries: [{ query: "本八幡 ピックルボール", clicks: 6, impressions: 60, ctr: 0.1, position: 2.5 }],
      },
    };
    expect(parseMetrics(serializeMetrics(withSearch))).toEqual(withSearch);
  });

  it("search 無しの旧データも valid(後方互換)", () => {
    expect(parseMetrics(serializeMetrics(metrics))).toEqual(metrics);
    expect(parseMetrics(serializeMetrics(metrics))?.search).toBeUndefined();
  });

  it("keyEventsMeasured 無しの旧データも valid(後方互換)", () => {
    expect(parseMetrics(serializeMetrics(metrics))).toEqual(metrics);
    expect(parseMetrics(serializeMetrics(metrics))?.keyEventsMeasured).toBeUndefined();
  });

  it("keyEventsMeasured 付きも往復できる", () => {
    const withMeasured: ArticleMetrics = {
      ...metrics,
      keyEventsMeasured: true,
    };
    expect(parseMetrics(serializeMetrics(withMeasured))).toEqual(withMeasured);
  });
});

describe("isKeyEventsMeasured", () => {
  it("publishedAt が since 以降なら true", () => {
    expect(isKeyEventsMeasured("2026-07-10T00:00:00.000Z", "2026-07-01")).toBe(true);
    expect(isKeyEventsMeasured("2026-07-01T00:00:00.000Z", "2026-07-01")).toBe(true);
  });

  it("publishedAt が since より前なら false", () => {
    expect(isKeyEventsMeasured("2026-06-20T00:00:00.000Z", "2026-07-01")).toBe(false);
  });

  it("since 未指定または publishedAt 不明なら false", () => {
    expect(isKeyEventsMeasured(undefined, "2026-07-01")).toBe(false);
    expect(isKeyEventsMeasured("2026-07-10T00:00:00.000Z", undefined)).toBe(false);
    expect(isKeyEventsMeasured("2026-07-10T00:00:00.000Z", "")).toBe(false);
  });

  it("不正な日付文字列なら false", () => {
    expect(isKeyEventsMeasured("not-a-date", "2026-07-01")).toBe(false);
    expect(isKeyEventsMeasured("2026-07-10T00:00:00.000Z", "not-a-date")).toBe(false);
  });
});

describe("articleSearchUrl", () => {
  it("origin + pagePath を連結(origin 末尾スラッシュは正規化)", () => {
    expect(articleSearchUrl("https://thepicklebang.com", "/news/a")).toBe(
      "https://thepicklebang.com/news/a"
    );
    expect(articleSearchUrl("https://thepicklebang.com/", "/news/a")).toBe(
      "https://thepicklebang.com/news/a"
    );
  });
});

describe("buildSearchMetrics", () => {
  const summary: MergedRow[] = [
    {
      keys: [],
      metrics: {
        clicks: { current: 10, prior: 8, deltaPct: 25 },
        impressions: { current: 200, prior: 150, deltaPct: 33.3 },
        ctr: { current: 0.05, prior: 0.053, deltaPct: -5.7 },
        position: { current: 3.2, prior: 4.1, deltaPct: -22 },
      },
    },
  ];
  const queries: MergedRow[] = [
    { keys: ["q-low"], metrics: { clicks: { current: 2, prior: 0, deltaPct: null }, impressions: { current: 30, prior: 0, deltaPct: null }, ctr: { current: 0.066, prior: 0, deltaPct: null }, position: { current: 5, prior: 0, deltaPct: null } } },
    { keys: ["q-high"], metrics: { clicks: { current: 6, prior: 4, deltaPct: 50 }, impressions: { current: 60, prior: 40, deltaPct: 50 }, ctr: { current: 0.1, prior: 0.1, deltaPct: 0 }, position: { current: 2.5, prior: 3, deltaPct: -16.7 } } },
  ];

  it("summary から clicks/impressions/ctr/position(前週比つき)を作る", () => {
    const s = buildSearchMetrics(summary, queries);
    expect(s.clicks).toEqual({ current: 10, prior: 8, deltaPct: 25 });
    expect(s.position).toEqual({ current: 3.2, prior: 4.1, deltaPct: -22 });
  });

  it("topQueries は clicks 降順・limit で切る", () => {
    const s = buildSearchMetrics(summary, queries, 1);
    expect(s.topQueries).toEqual([
      { query: "q-high", clicks: 6, impressions: 60, ctr: 0.1, position: 2.5 },
    ]);
  });

  it("summary 行が無ければ 0/0/null・topQueries は空", () => {
    const s: SearchMetrics = buildSearchMetrics([], []);
    expect(s.clicks).toEqual({ current: 0, prior: 0, deltaPct: null });
    expect(s.topQueries).toEqual([]);
  });

  it("欠損行(keys/metrics 無し・clicks 無しで sort も実行)は query='' ・各値 0 にフォールバック", () => {
    const s = buildSearchMetrics([], [
      { keys: [], metrics: {} },
      { keys: ["x"], metrics: {} },
    ]);
    expect(s.topQueries).toEqual([
      { query: "", clicks: 0, impressions: 0, ctr: 0, position: 0 },
      { query: "x", clicks: 0, impressions: 0, ctr: 0, position: 0 },
    ]);
  });
});

describe("buildMetricsMirrorProps", () => {
  it("成績データ(JSON)と成績更新時刻(date)を作る", () => {
    const metrics: ArticleMetrics = {
      pagePath: "/news/a",
      views: { current: 1, prior: 0, deltaPct: null },
      users: { current: 1, prior: 0, deltaPct: null },
      period: PERIOD,
    };
    const props = buildMetricsMirrorProps(metrics, "2026-06-22T00:00:00.000Z");
    const p = props as Record<string, { rich_text?: Array<{ text: { content: string } }>; date?: { start: string } }>;
    expect(parseMetrics(p[METRICS_PROPS.data].rich_text![0].text.content)).toEqual(metrics);
    expect(p[METRICS_PROPS.updatedAt].date).toEqual({ start: "2026-06-22T00:00:00.000Z" });
  });
});

describe("summarizeMetrics", () => {
  it("合計と最高表示数の記事を返す(users 欠落は0・top は表示数最大を維持)", () => {
    const items = [
      { title: "A", metrics: { views: { current: 100 }, users: { current: 50 } } },
      { title: "B", metrics: { views: { current: 300 }, users: { current: 80 } } },
      // C: top 確定後に表示数の少ない計測済みが来ても top は B のまま(views > top.views が false)。
      { title: "C", metrics: { views: { current: 30 } } },
      { title: "D" },
    ];
    const s = summarizeMetrics(items);
    expect(s.totalViews).toBe(430);
    expect(s.totalUsers).toBe(130); // C は users 欠落で 0 加算
    expect(s.count).toBe(3);
    expect(s.top).toEqual({ title: "B", views: 300 });
  });

  it("計測済みが無ければ top は null", () => {
    expect(summarizeMetrics([{ title: "A" }])).toEqual({
      totalViews: 0,
      totalUsers: 0,
      count: 0,
      top: null,
    });
  });
});
