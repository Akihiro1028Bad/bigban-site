import { describe, expect, it } from "vitest";

import type { ArticleMetrics } from "./metrics";
import { daysSincePublished, isLowSample, reviewLabels } from "./metricsReview";

const PERIOD = { start: "2026-06-15", end: "2026-06-21" };

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

const measuredCta: ArticleMetrics["ctaEvents"] = {
  reservationClick: { current: 0, prior: 0, deltaPct: null },
  reserveEntryClick: { current: 0, prior: 0, deltaPct: null },
  lineClick: { current: 4, prior: 2, deltaPct: 100 },
  instagramClick: { current: 2, prior: 1, deltaPct: 100 },
  other: { current: 1, prior: 0, deltaPct: null },
};

function search(over: Partial<ArticleMetrics["search"] & object> = {}): ArticleMetrics["search"] {
  return {
    clicks: { current: 10, prior: 8, deltaPct: 25 },
    impressions: { current: 200, prior: 150, deltaPct: 33.3 },
    ctr: { current: 0.05, prior: 0.05, deltaPct: 0 },
    position: { current: 3, prior: 4, deltaPct: -25 },
    topQueries: [],
    ...over,
  };
}

describe("daysSincePublished", () => {
  const now = Date.parse("2026-06-29T00:00:00Z");
  it("経過日数を切り捨てで返す", () => {
    expect(daysSincePublished("2026-06-01T00:00:00Z", now)).toBe(28);
    expect(daysSincePublished("2026-06-28T12:00:00Z", now)).toBe(0);
  });
  it("不正な日付は null", () => {
    expect(daysSincePublished("not-a-date", now)).toBeNull();
  });
});

describe("reviewLabels", () => {
  it("source-errorの0は未計測のみで要改稿にしない", () => {
    const m = base({
      measurementStatus: "source-error",
      views: { current: 0, prior: 0, deltaPct: null },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
    });
    expect(reviewLabels(m, 28)).toEqual(["未計測"]);
  });

  it.each(["measured", "path-unmatched"] as const)("%sの実測0は28日境界で要改稿になる", (measurementStatus) => {
    const m = base({
      measurementStatus,
      views: { current: 0, prior: 0, deltaPct: null },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
    });
    expect(reviewLabels(m, 27)).not.toContain("要改稿");
    expect(reviewLabels(m, 28)).toContain("要改稿");
  });

  it("CTR弱い: impressions>=100 かつ ctr<0.03", () => {
    const m = base({ search: search({ impressions: { current: 100, prior: 0, deltaPct: null }, ctr: { current: 0.029, prior: 0, deltaPct: null } }) });
    expect(reviewLabels(m, 3)).toContain("CTR弱い");
    // 境界: impressions 99 / ctr 0.03 は付かない
    const m2 = base({ search: search({ impressions: { current: 99, prior: 0, deltaPct: null }, ctr: { current: 0.03, prior: 0, deltaPct: null } }) });
    expect(reviewLabels(m2, 3)).not.toContain("CTR弱い");
  });

  it("順位あと少し: position 5〜15(境界含む)", () => {
    expect(reviewLabels(base({ search: search({ position: { current: 5, prior: 0, deltaPct: null } }) }), 3)).toContain("順位あと少し");
    expect(reviewLabels(base({ search: search({ position: { current: 15, prior: 0, deltaPct: null } }) }), 3)).toContain("順位あと少し");
    expect(reviewLabels(base({ search: search({ position: { current: 4, prior: 0, deltaPct: null } }) }), 3)).not.toContain("順位あと少し");
    expect(reviewLabels(base({ search: search({ position: { current: 16, prior: 0, deltaPct: null } }) }), 3)).not.toContain("順位あと少し");
  });

  it("予約意図0・SNSその他7なら読まれるが予約意図弱い", () => {
    const m = base({ views: { current: 50, prior: 0, deltaPct: null }, ctaEvents: measuredCta, ctaEventsMeasured: true });
    expect(reviewLabels(m, 3)).toContain("読まれるが予約意図弱い");
    const m2 = base({ views: { current: 49, prior: 0, deltaPct: null }, ctaEvents: measuredCta, ctaEventsMeasured: true });
    expect(reviewLabels(m2, 3)).not.toContain("読まれるが予約意図弱い");
  });

  it("イベント別未計測なら予約意図未計測", () => {
    const labels = reviewLabels(
      base({
        views: { current: 60, prior: 0, deltaPct: null },
        keyEvents: { current: 0, prior: 0, deltaPct: null },
        ctaEvents: measuredCta,
        ctaEventsMeasured: false,
      }),
      3
    );
    expect(labels).toContain("予約意図未計測");
    expect(labels).not.toContain("読まれるが予約意図弱い");
  });

  it("CTA部分計測は予約意図0の完全計測とみなさない", () => {
    const labels = reviewLabels(base({
      views: { current: 60, prior: 0, deltaPct: null },
      ctaEvents: measuredCta,
      ctaEventsMeasured: false,
      ctaEventsMeasurementStatus: "partial",
    }), 3);
    expect(labels).toContain("予約意図未計測");
    expect(labels).not.toContain("読まれるが予約意図弱い");
  });

  it("計測済み: 予約意図が1以上なら弱いを付けない", () => {
    const labels = reviewLabels(
      base({
        views: { current: 60, prior: 0, deltaPct: null },
        ctaEvents: { ...measuredCta!, reservationClick: { current: 1, prior: 0, deltaPct: null } },
        ctaEventsMeasured: true,
      }),
      3
    );
    expect(labels).not.toContain("予約意図未計測");
    expect(labels).not.toContain("読まれるが予約意図弱い");
  });

  it("views<50: CV未計測も付かない", () => {
    const labels = reviewLabels(
      base({
        views: { current: 10, prior: 0, deltaPct: null },
        keyEvents: { current: 0, prior: 0, deltaPct: null },
        keyEventsMeasured: false,
      }),
      3
    );
    expect(labels).not.toContain("予約意図未計測");
    expect(labels).not.toContain("読まれるが予約意図弱い");
  });

  it("要改稿: 公開28日後かつ低調(views<50 & clicks<10)。伸びているは出さない", () => {
    const m = base({
      views: { current: 20, prior: 5, deltaPct: 300 },
      keyEvents: { current: 0, prior: 0, deltaPct: null },
      search: search({ clicks: { current: 3, prior: 1, deltaPct: 200 } }),
    });
    const labels = reviewLabels(m, 28);
    expect(labels).toContain("要改稿");
    expect(labels).not.toContain("伸びている");
    // 27日目はまだ要改稿にしない
    expect(reviewLabels(m, 27)).not.toContain("要改稿");
    // 公開日不明(null)は要改稿にしない
    expect(reviewLabels(m, null)).not.toContain("要改稿");
  });

  it("伸びている: 表示 or 検索クリックが前週比プラス", () => {
    expect(reviewLabels(base(), 3)).toContain("伸びている");
    const flat = base({
      views: { current: 100, prior: 100, deltaPct: 0 },
      search: search({ clicks: { current: 10, prior: 10, deltaPct: 0 } }),
    });
    expect(reviewLabels(flat, 3)).not.toContain("伸びている");
  });

  it("旧keyEventsが多くても予約成功とはみなさない", () => {
    const m = base({ search: undefined, keyEvents: { current: 99, prior: 50, deltaPct: 98 } });
    expect(reviewLabels(m, 3)).toContain("予約意図未計測");
  });
});

describe("isLowSample", () => {
  it("source-errorを母数小の実測サンプルとして扱わない", () => {
    expect(isLowSample(base({ measurementStatus: "source-error", views: { current: 0, prior: 0, deltaPct: null } }))).toBe(false);
  });
  it("impressions<100 かつ views<50 で true", () => {
    expect(
      isLowSample(
        base({
          views: { current: 49, prior: 0, deltaPct: null },
          search: search({ impressions: { current: 99, prior: 0, deltaPct: null } }),
        })
      )
    ).toBe(true);
  });

  it("どちらか母数が十分なら false", () => {
    expect(
      isLowSample(
        base({
          views: { current: 50, prior: 0, deltaPct: null },
          search: search({ impressions: { current: 99, prior: 0, deltaPct: null } }),
        })
      )
    ).toBe(false);
    expect(
      isLowSample(
        base({
          views: { current: 49, prior: 0, deltaPct: null },
          search: search({ impressions: { current: 100, prior: 0, deltaPct: null } }),
        })
      )
    ).toBe(false);
  });
});
