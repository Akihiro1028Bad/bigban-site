// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import {
  buildApproveUrl,
  buildPublicNotionUrl,
  extractActionTitles,
  extractMetrics,
  periodLabel,
} from "./notify-build";

function page(id: string, title: string): NotionPage {
  return {
    id,
    url: `https://notion.so/${id}`,
    properties: { "施策名": { type: "title", title: [{ plain_text: title }] } },
  };
}

describe("extractMetrics", () => {
  it("ga4/gsc summary[0].metrics から指標を取り出す", () => {
    const snapshot = {
      ga4: { summary: [{ metrics: { sessions: { current: 777, prior: 0, deltaPct: null } } }] },
      gsc: {
        summary: [
          {
            metrics: {
              clicks: { current: 404, prior: 470, deltaPct: -14 },
              impressions: { current: 1492, prior: 1434, deltaPct: 4 },
              position: { current: 4.08, prior: 3.24, deltaPct: 25.9 },
            },
          },
        ],
      },
    };

    expect(extractMetrics(snapshot)).toEqual({
      sessions: { current: 777, prior: 0, deltaPct: null },
      clicks: { current: 404, prior: 470, deltaPct: -14 },
      impressions: { current: 1492, prior: 1434, deltaPct: 4 },
      position: { current: 4.08, prior: 3.24, deltaPct: 25.9 },
    });
  });

  it("欠落したデータは undefined にし、prior/deltaPct を補完する", () => {
    expect(extractMetrics({})).toEqual({
      sessions: undefined,
      clicks: undefined,
      impressions: undefined,
      position: undefined,
    });

    const partial = extractMetrics({
      gsc: { summary: [{ metrics: { clicks: { current: 10 } } }] },
    });
    expect(partial.clicks).toEqual({ current: 10, prior: 0, deltaPct: null });
  });
});

describe("periodLabel", () => {
  it("対象週を整形する", () => {
    expect(periodLabel({ period: { start: "2026-06-08", end: "2026-06-14" } })).toBe(
      "2026-06-08〜2026-06-14"
    );
  });

  it("period が無ければ空の範囲を返す", () => {
    expect(periodLabel({})).toBe("〜");
  });
});

describe("extractActionTitles", () => {
  it("title プロパティから最大件数だけタイトルを取り出す", () => {
    const pages = [page("a", "施策A"), page("b", "施策B"), page("c", "施策C"), page("d", "施策D")];
    expect(extractActionTitles(pages, "施策名", 3)).toEqual(["施策A", "施策B", "施策C"]);
  });

  it("空タイトルや欠落プロパティを除外する", () => {
    const empty: NotionPage = { id: "e", url: "", properties: {} };
    const blank = page("f", "   ");
    const noPlainText: NotionPage = {
      id: "h",
      url: "",
      properties: { "施策名": { type: "title", title: [{}] } },
    };
    expect(
      extractActionTitles([empty, blank, noPlainText, page("g", "有効")], "施策名", 3)
    ).toEqual(["有効"]);
  });
});

describe("buildPublicNotionUrl", () => {
  it("ドメイン + ダッシュ無しページIDで公開URLを作る", () => {
    expect(
      buildPublicNotionUrl("pickle.notion.site", "38099efa-346b-8122-9681-f4d2cc321a31")
    ).toBe("https://pickle.notion.site/38099efa346b81229681f4d2cc321a31");
  });

  it("ドメイン未設定なら null", () => {
    expect(buildPublicNotionUrl(undefined, "abc")).toBeNull();
  });
});

describe("buildApproveUrl", () => {
  it("末尾スラッシュを除いた承認URLを作る", () => {
    expect(buildApproveUrl("https://www.thepicklebang.com/", "s3cr3t")).toBe(
      "https://www.thepicklebang.com/growth/approve?token=s3cr3t"
    );
  });

  it("特殊文字を含むトークンをエンコードする", () => {
    expect(buildApproveUrl("https://x.com", "a b&c")).toBe(
      "https://x.com/growth/approve?token=a%20b%26c"
    );
  });

  it("URL か secret が欠ければ null", () => {
    expect(buildApproveUrl(undefined, "s")).toBeNull();
    expect(buildApproveUrl("https://x.com", undefined)).toBeNull();
  });
});
