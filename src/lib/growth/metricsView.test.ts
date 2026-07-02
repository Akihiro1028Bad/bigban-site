import { describe, expect, it } from "vitest";

import type { ArticleMetrics } from "./metrics";
import { reviewLabels } from "./metricsView";

const PERIOD = { start: "2026-06-15", end: "2026-06-21" };
// 判定に「公開後日数」を使うケースの基準時刻(固定)。
const NOW = Date.parse("2026-06-29T00:00:00Z");

function base(over: Partial<ArticleMetrics> = {}): ArticleMetrics {
  return {
    pagePath: "/news/a",
    views: { current: 100, prior: 80, deltaPct: 25 },
    users: { current: 60, prior: 50, deltaPct: 20 },
    keyEvents: { current: 5, prior: 3, deltaPct: 66.7 },
    period: PERIOD,
    ...over,
  };
}

function search(over: Partial<NonNullable<ArticleMetrics["search"]>> = {}): ArticleMetrics["search"] {
  return {
    clicks: { current: 10, prior: 8, deltaPct: 25 },
    impressions: { current: 200, prior: 150, deltaPct: 33.3 },
    ctr: { current: 0.05, prior: 0.05, deltaPct: 0 },
    position: { current: 3, prior: 4, deltaPct: -25 },
    topQueries: [],
    ...over,
  };
}

describe("reviewLabels", () => {
  it("string[] を返す(判定文言は本番 PerformanceBoard の LABEL_CLASS に一致)", () => {
    const labels = reviewLabels(base(), NOW);
    expect(Array.isArray(labels)).toBe(true);
    expect(labels).toContain("伸びている");
  });

  it("表示もクリックも 0 は 未計測 のみ", () => {
    const m = base({
      views: { current: 0, prior: 0, deltaPct: null },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
    });
    expect(reviewLabels(m, NOW)).toEqual(["未計測"]);
  });

  it("CTR弱い: impressions>=100 かつ ctr<0.03(境界: 99/0.03 は付かない)", () => {
    const weak = base({
      search: search({
        impressions: { current: 100, prior: 0, deltaPct: null },
        ctr: { current: 0.029, prior: 0, deltaPct: null },
      }),
    });
    expect(reviewLabels(weak, NOW)).toContain("CTR弱い");

    const strong = base({
      search: search({
        impressions: { current: 99, prior: 0, deltaPct: null },
        ctr: { current: 0.03, prior: 0, deltaPct: null },
      }),
    });
    expect(reviewLabels(strong, NOW)).not.toContain("CTR弱い");
  });

  it("順位あと少し: position 5〜15(境界含む)", () => {
    expect(
      reviewLabels(base({ search: search({ position: { current: 5, prior: 0, deltaPct: null } }) }), NOW)
    ).toContain("順位あと少し");
    expect(
      reviewLabels(base({ search: search({ position: { current: 15, prior: 0, deltaPct: null } }) }), NOW)
    ).toContain("順位あと少し");
    expect(
      reviewLabels(base({ search: search({ position: { current: 4, prior: 0, deltaPct: null } }) }), NOW)
    ).not.toContain("順位あと少し");
    expect(
      reviewLabels(base({ search: search({ position: { current: 16, prior: 0, deltaPct: null } }) }), NOW)
    ).not.toContain("順位あと少し");
  });

  it("読まれるがCTA弱い: views>=50 かつ keyEvents=0(境界: 49 は付かない)", () => {
    const m = base({
      views: { current: 50, prior: 0, deltaPct: null },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
    });
    expect(reviewLabels(m, NOW)).toContain("読まれるがCTA弱い");

    const m2 = base({
      views: { current: 49, prior: 0, deltaPct: null },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
    });
    expect(reviewLabels(m2, NOW)).not.toContain("読まれるがCTA弱い");
  });

  it("要改稿: 公開28日後かつ低調(views<50 & clicks<10)。伸びているは併記しない", () => {
    // publishedAt を NOW から 28日前に置く。
    const m = base({
      views: { current: 20, prior: 5, deltaPct: 300 },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
      search: search({ clicks: { current: 3, prior: 1, deltaPct: 200 } }),
      publishedAt: "2026-06-01T00:00:00Z",
    });
    const labels = reviewLabels(m, NOW);
    expect(labels).toContain("要改稿");
    expect(labels).not.toContain("伸びている");
  });

  it("要改稿: 公開27日後(境界手前)はまだ付かない", () => {
    const m = base({
      views: { current: 20, prior: 5, deltaPct: 300 },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
      search: search({ clicks: { current: 3, prior: 1, deltaPct: 200 } }),
      publishedAt: "2026-06-02T00:00:00Z",
    });
    expect(reviewLabels(m, NOW)).not.toContain("要改稿");
  });

  it("要改稿: publishedAt 無し(公開日不明)は付かない", () => {
    const m = base({
      views: { current: 20, prior: 5, deltaPct: 300 },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
      search: search({ clicks: { current: 3, prior: 1, deltaPct: 200 } }),
    });
    expect(reviewLabels(m, NOW)).not.toContain("要改稿");
  });

  it("要改稿: publishedAt が不正日付は付かない(daysSincePublished=null)", () => {
    const m = base({
      views: { current: 20, prior: 5, deltaPct: 300 },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
      search: search({ clicks: { current: 3, prior: 1, deltaPct: 200 } }),
      publishedAt: "not-a-date",
    });
    expect(reviewLabels(m, NOW)).not.toContain("要改稿");
  });

  it("伸びている: 表示 or 検索クリックが前週比プラス。フラットは付かない", () => {
    expect(reviewLabels(base(), NOW)).toContain("伸びている");

    const flat = base({
      views: { current: 100, prior: 100, deltaPct: 0 },
      search: search({ clicks: { current: 10, prior: 10, deltaPct: 0 } }),
    });
    expect(reviewLabels(flat, NOW)).not.toContain("伸びている");
  });

  it("複数該当: CTR弱い + 順位あと少し + 読まれるがCTA弱い を同時に返す", () => {
    const m = base({
      views: { current: 60, prior: 40, deltaPct: 50 },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
      search: search({
        clicks: { current: 2, prior: 1, deltaPct: 100 },
        impressions: { current: 500, prior: 300, deltaPct: 66.7 },
        ctr: { current: 0.01, prior: 0.02, deltaPct: -50 },
        position: { current: 8, prior: 10, deltaPct: -20 },
      }),
    });
    const labels = reviewLabels(m, NOW);
    expect(labels).toEqual(
      expect.arrayContaining(["CTR弱い", "順位あと少し", "読まれるがCTA弱い", "伸びている"])
    );
  });

  it("search 無し(旧データ)でも落ちない", () => {
    const m = base({ search: undefined, keyEvents: { current: 0, prior: 0, deltaPct: null } });
    expect(reviewLabels(m, NOW)).toContain("読まれるがCTA弱い");
  });

  it("keyEvents 無し(旧データ)でも 0 とみなして落ちない(読まれるがCTA弱い)", () => {
    const m = base({
      views: { current: 60, prior: 0, deltaPct: null },
      keyEvents: undefined,
    });
    expect(reviewLabels(m, NOW)).toContain("読まれるがCTA弱い");
  });

  it("nowMs 省略時は現在時刻を基準にする(publishedAt 無しなら要改稿は付かない)", () => {
    const m = base();
    expect(reviewLabels(m)).toContain("伸びている");
  });
});
