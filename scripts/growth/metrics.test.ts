import { describe, expect, it } from "vitest";

import type { MergedRow } from "./transform";
import {
  articlePagePath,
  buildMetricsMirrorProps,
  type ArticleMetrics,
  metricsForPagePath,
  METRICS_PROPS,
  normalizePagePath,
  parseMetrics,
  serializeMetrics,
  summarizeMetrics,
} from "./metrics";

const PERIOD = { start: "2026-06-15", end: "2026-06-21" };

function row(pagePath: string, views: [number, number], users: [number, number]): MergedRow {
  return {
    keys: [pagePath],
    metrics: {
      screenPageViews: { current: views[0], prior: views[1], deltaPct: null },
      activeUsers: { current: users[0], prior: users[1], deltaPct: null },
    },
  };
}

describe("articlePagePath", () => {
  it("ja は /news/{slug}", () => {
    expect(articlePagePath("spring-open", "ja")).toBe("/news/spring-open");
  });
  it("ja 以外(en)は /en/news/{slug}", () => {
    expect(articlePagePath("spring-open", "en")).toBe("/en/news/spring-open");
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
