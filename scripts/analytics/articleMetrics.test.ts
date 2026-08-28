// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  buildArticleRows,
  formatArticleRow,
  formatDelta,
  isArticlePath,
  isBrandQuery,
  normalizeArticlePath,
  sumEntrySessions,
} from "./articleMetrics.mjs";

describe("normalizeArticlePath", () => {
  it("オリジンを取り除く", () => {
    expect(normalizeArticlePath("https://www.thepicklebang.com/columns/a")).toBe(
      "/columns/a",
    );
  });

  it("クエリ文字列を取り除く(プレビューURLの draftKey 等が別行にならないように)", () => {
    expect(normalizeArticlePath("/columns/a?draftKey=xxx&contentId=a")).toBe(
      "/columns/a",
    );
  });

  it("末尾スラッシュを取り除く", () => {
    expect(normalizeArticlePath("/columns/a/")).toBe("/columns/a");
  });

  it("正規化済みのパスはそのまま返す", () => {
    expect(normalizeArticlePath("/columns/a")).toBe("/columns/a");
  });

  it("ルートパスは空文字にせずそのまま返す", () => {
    expect(normalizeArticlePath("/")).toBe("/");
  });
});

describe("isArticlePath", () => {
  it.each([
    ["/columns/pickleball-funabashi-guide", true],
    ["/news/pbt-club-membership", true],
    ["/en/columns/hyrox-beginners-guide", true],
    ["/en/news/picklerox-2026", true],
  ])("記事パス %s を記事と判定する", (path, expected) => {
    expect(isArticlePath(path)).toBe(expected);
  });

  it.each([
    ["/", false],
    ["/reserve", false],
    ["/hyrox", false],
    // 一覧ページは記事ではない(末尾スラッシュ正規化後は "/columns" になる)
    ["/columns", false],
    ["/en/news", false],
  ])("記事でないパス %s を除外する", (path, expected) => {
    expect(isArticlePath(path)).toBe(expected);
  });
});

describe("isBrandQuery", () => {
  it.each([
    "ピックルバンセオリー",
    "ピックル バン",
    "the pickle bang theory",
    "PBT CLUB",
    "セオリー 本八幡",
    "RST Agency",
  ])("指名クエリ %s を指名と判定する", (query) => {
    expect(isBrandQuery(query)).toBe(true);
  });

  it.each(["ピックルボール 船橋", "hyrox とは", "千葉 ピックルボール"])(
    "非指名クエリ %s を指名と判定しない",
    (query) => {
      expect(isBrandQuery(query)).toBe(false);
    },
  );
});

describe("formatDelta", () => {
  it("前期が0なら new を返す", () => {
    expect(formatDelta(10, 0)).toBe("new");
  });

  it("増加は + 付きの整数パーセントで返す", () => {
    expect(formatDelta(150, 100)).toBe("+50%");
  });

  it("減少はマイナス付きで返す", () => {
    expect(formatDelta(80, 100)).toBe("-20%");
  });

  it("横ばいは +0% で返す", () => {
    expect(formatDelta(100, 100)).toBe("+0%");
  });

  it("今期も前期も0なら - を返す(データが無い行を new と誤表示しない)", () => {
    expect(formatDelta(0, 0)).toBe("-");
  });
});

describe("sumEntrySessions", () => {
  it("記事パスの入口セッションだけを合計する", () => {
    const entry = new Map([
      ["/columns/a", 10],
      ["/news/b", 5],
      ["/reserve", 100],
      ["/", 500],
    ]);
    expect(sumEntrySessions(entry)).toBe(15);
  });

  it("記事が1件もなければ0を返す", () => {
    expect(sumEntrySessions(new Map([["/", 500]]))).toBe(0);
  });
});

describe("buildArticleRows", () => {
  const base = {
    entry: new Map([
      ["/columns/funabashi", 137],
      ["/news/pbt-club", 58],
    ]),
    entryPrev: new Map([["/columns/funabashi", 100]]),
    pageViews: new Map([
      ["/columns/funabashi", 202],
      ["/news/pbt-club", 319],
    ]),
    ctaCounts: new Map([
      ["/columns/funabashi", 24],
      ["/news/pbt-club", 68],
    ]),
    gscRows: [
      {
        page: "https://www.thepicklebang.com/columns/funabashi",
        query: "ピックルボール 船橋",
        impressions: 200,
        clicks: 40,
        position: 3.0,
      },
      {
        page: "https://www.thepicklebang.com/columns/funabashi",
        query: "船橋 ピックルボール",
        impressions: 100,
        clicks: 15,
        position: 2.0,
      },
    ],
  };

  it("入口セッションの降順で並べる", () => {
    const rows = buildArticleRows(base);
    expect(rows.map((r) => r.path)).toEqual([
      "/columns/funabashi",
      "/news/pbt-club",
    ]);
  });

  it("入口セッション・PV・CTA・前期値をパスで突き合わせる", () => {
    const [funabashi] = buildArticleRows(base);
    expect(funabashi).toMatchObject({
      entrySessions: 137,
      prevEntrySessions: 100,
      pageViews: 202,
      ctaCount: 24,
    });
  });

  it("CTA率の分母は入口セッションではなく PV を使う(告知系記事で100%超にしないため)", () => {
    // 入口S=58 に対し CTA=68。入口S分母だと117%になるが、PV=319 分母なら 21%。
    const [, pbtClub] = buildArticleRows(base);
    expect(pbtClub.ctaRate).toBeCloseTo(68 / 319);
  });

  it("PVが0なら CTA率は null にする(ゼロ除算を出さない)", () => {
    const rows = buildArticleRows({
      ...base,
      entry: new Map([["/columns/x", 3]]),
      entryPrev: new Map(),
      pageViews: new Map(),
      ctaCounts: new Map(),
      gscRows: [],
    });
    expect(rows[0].ctaRate).toBeNull();
  });

  it("GSC の順位を表示回数で加重平均する", () => {
    const [funabashi] = buildArticleRows(base);
    // (3.0*200 + 2.0*100) / 300 = 2.666...
    expect(funabashi.gscPosition).toBeCloseTo((3.0 * 200 + 2.0 * 100) / 300);
    expect(funabashi.gscImpressions).toBe(300);
    expect(funabashi.gscClicks).toBe(55);
  });

  it("指名クエリを GSC 集計から除外し、指名の表示回数は別枠で数える", () => {
    const rows = buildArticleRows({
      ...base,
      gscRows: [
        ...base.gscRows,
        {
          page: "https://www.thepicklebang.com/columns/funabashi",
          query: "ピックルバンセオリー 船橋",
          impressions: 500,
          clicks: 300,
          position: 1.0,
        },
      ],
    });
    const [funabashi] = rows;
    expect(funabashi.gscImpressions).toBe(300);
    expect(funabashi.gscClicks).toBe(55);
    expect(funabashi.brandImpressions).toBe(500);
  });

  it("非指名の表示が0なら順位は null にする(指名だけの記事で誤った順位を出さない)", () => {
    const rows = buildArticleRows({
      ...base,
      entry: new Map([["/columns/only-brand", 5]]),
      entryPrev: new Map(),
      pageViews: new Map([["/columns/only-brand", 10]]),
      ctaCounts: new Map(),
      gscRows: [
        {
          page: "/columns/only-brand",
          query: "the pickle bang theory",
          impressions: 80,
          clicks: 40,
          position: 1.0,
        },
      ],
    });
    expect(rows[0].gscPosition).toBeNull();
    expect(rows[0].gscImpressions).toBe(0);
    expect(rows[0].brandImpressions).toBe(80);
  });

  it("記事でないパスは GA4・GSC のどちらから来ても除外する", () => {
    const rows = buildArticleRows({
      ...base,
      entry: new Map([
        ["/columns/funabashi", 137],
        ["/reserve", 4100],
      ]),
      pageViews: new Map([["/", 7369]]),
      gscRows: [
        {
          page: "https://www.thepicklebang.com/hyrox",
          query: "hyrox 千葉",
          impressions: 100,
          clicks: 10,
          position: 3.0,
        },
      ],
    });
    expect(rows.map((r) => r.path)).toEqual([
      "/columns/funabashi",
      "/news/pbt-club",
    ]);
  });

  it("GSC にしか出てこない記事も行として拾う(GA4で入口0でも取りこぼさない)", () => {
    const rows = buildArticleRows({
      entry: new Map(),
      entryPrev: new Map(),
      pageViews: new Map(),
      ctaCounts: new Map(),
      gscRows: [
        {
          page: "/news/only-gsc",
          query: "ハイロックス 大会",
          impressions: 74,
          clicks: 1,
          position: 8.0,
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      path: "/news/only-gsc",
      entrySessions: 0,
      gscImpressions: 74,
    });
  });

  it("同一記事のプレビューURL(クエリ付き)を1行に合算する", () => {
    const rows = buildArticleRows({
      ...base,
      entry: new Map([
        ["/columns/funabashi", 137],
        ["/columns/funabashi?draftKey=abc", 1],
      ]),
      gscRows: [],
    });
    expect(rows[0].entrySessions).toBe(138);
  });
});

describe("formatArticleRow", () => {
  it("全項目が揃った行を1行に整形する", () => {
    const line = formatArticleRow({
      path: "/columns/funabashi",
      entrySessions: 137,
      prevEntrySessions: 100,
      pageViews: 202,
      ctaCount: 24,
      ctaRate: 24 / 202,
      gscImpressions: 297,
      gscClicks: 55,
      gscPosition: 2.9,
      brandImpressions: 0,
    });
    expect(line).toBe(
      "/columns/funabashi  入口S=137 (+37%)  PV=202  CTA=24 (12%)  GSC非指名: 表示297 クリック55 順位2.9",
    );
  });

  it("前期が0なら new と表示する", () => {
    const line = formatArticleRow({
      path: "/news/a",
      entrySessions: 51,
      prevEntrySessions: 0,
      pageViews: 116,
      ctaCount: 19,
      ctaRate: 19 / 116,
      gscImpressions: 138,
      gscClicks: 18,
      gscPosition: 3.5,
      brandImpressions: 0,
    });
    expect(line).toContain("入口S=51 (new)");
  });

  it("GSC 非指名データが無い記事は GSC 欄を「表示なし」と書く", () => {
    const line = formatArticleRow({
      path: "/news/a",
      entrySessions: 5,
      prevEntrySessions: 5,
      pageViews: 30,
      ctaCount: 0,
      ctaRate: 0,
      gscImpressions: 0,
      gscClicks: 0,
      gscPosition: null,
      brandImpressions: 38,
    });
    expect(line).toContain("GSC非指名: 表示なし");
  });

  it("指名クエリの表示があれば注記する(指名で稼いでいる記事を誤判定しないため)", () => {
    const line = formatArticleRow({
      path: "/news/a",
      entrySessions: 5,
      prevEntrySessions: 5,
      pageViews: 30,
      ctaCount: 0,
      ctaRate: 0,
      gscImpressions: 0,
      gscClicks: 0,
      gscPosition: null,
      brandImpressions: 38,
    });
    expect(line).toContain("指名表示38");
  });

  it("PVが無い記事は CTA率を - と書く", () => {
    const line = formatArticleRow({
      path: "/news/a",
      entrySessions: 3,
      prevEntrySessions: 0,
      pageViews: 0,
      ctaCount: 0,
      ctaRate: null,
      gscImpressions: 0,
      gscClicks: 0,
      gscPosition: null,
      brandImpressions: 0,
    });
    expect(line).toContain("CTA=0 (-)");
  });
});
