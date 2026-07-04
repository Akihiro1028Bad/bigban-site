// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  growthMediaForRow,
  growthEndpoint,
  growthArticleSegment,
  normalizeColumnsSelectFields,
} from "./endpoint";

describe("growthMediaForRow", () => {
  it("`ニュース` は news に解決する", () => {
    expect(growthMediaForRow("ニュース")).toBe("news");
  });

  it("`コラム`・未追加・空・未知は column にフォールバックする", () => {
    expect(growthMediaForRow("コラム")).toBe("column");
    expect(growthMediaForRow(undefined)).toBe("column");
    expect(growthMediaForRow("")).toBe("column");
    expect(growthMediaForRow("未知")).toBe("column");
  });

  it("前後の空白は無視する", () => {
    expect(growthMediaForRow("  ニュース  ")).toBe("news");
  });
});

describe("growthEndpoint", () => {
  it("news は env を無視して常に news", () => {
    expect(growthEndpoint("news", { GROWTH_MICROCMS_ENDPOINT: "columns" })).toBe(
      "news"
    );
  });

  it("column は env 従属(既定 news)", () => {
    expect(growthEndpoint("column", { GROWTH_MICROCMS_ENDPOINT: "columns" })).toBe(
      "columns"
    );
    expect(growthEndpoint("column", {})).toBe("news");
    expect(growthEndpoint("column", { GROWTH_MICROCMS_ENDPOINT: "  " })).toBe("news");
  });

  it("既定 media は column(挙動不変)", () => {
    expect(growthEndpoint(undefined, { GROWTH_MICROCMS_ENDPOINT: "columns" })).toBe(
      "columns"
    );
  });
});

describe("growthArticleSegment", () => {
  it("news は常に news", () => {
    expect(growthArticleSegment("news", { GROWTH_MICROCMS_ENDPOINT: "columns" })).toBe(
      "news"
    );
  });

  it("column の endpoint が columns なら columns", () => {
    expect(
      growthArticleSegment("column", { GROWTH_MICROCMS_ENDPOINT: "columns" })
    ).toBe("columns");
  });

  it("未知 endpoint は news に丸める(壊れ導線防止)", () => {
    expect(growthArticleSegment("column", { GROWTH_MICROCMS_ENDPOINT: "blog" })).toBe(
      "news"
    );
  });
});

describe("normalizeColumnsSelectFields", () => {
  it("columns 系のとき articleType の非空文字列を配列に包む(Bug1)", () => {
    const out = normalizeColumnsSelectFields("columns", {
      title: "t",
      articleType: "獲得",
    });
    expect(out.articleType).toEqual(["獲得"]);
    expect(out.title).toBe("t");
  });

  it("既に配列の articleType はそのまま通す(二重配列にしない)", () => {
    const out = normalizeColumnsSelectFields("columns", {
      articleType: ["獲得"],
    });
    expect(out.articleType).toEqual(["獲得"]);
  });

  it("空文字列の articleType はキー自体を出さない(欠落耐性・省略挙動維持)", () => {
    const out = normalizeColumnsSelectFields("columns", {
      title: "t",
      articleType: "",
    });
    expect("articleType" in out).toBe(false);
    expect(out.title).toBe("t");
  });

  it("空白のみの articleType もキーを落とす", () => {
    const out = normalizeColumnsSelectFields("columns", { articleType: "  " });
    expect("articleType" in out).toBe(false);
  });

  it("undefined の articleType はキーを出さない", () => {
    const out = normalizeColumnsSelectFields("columns", { articleType: undefined });
    expect("articleType" in out).toBe(false);
  });

  it("articleType キー自体が無いときは何も足さない", () => {
    const out = normalizeColumnsSelectFields("columns", { title: "t" });
    expect("articleType" in out).toBe(false);
    expect(out.title).toBe("t");
  });

  it("空配列の articleType はキーを落とす(空 select を送らない)", () => {
    const out = normalizeColumnsSelectFields("columns", { articleType: [] });
    expect("articleType" in out).toBe(false);
  });

  it("news エンドポイントには適用しない(articleType が無い媒体・触らない)", () => {
    const payload = { title: "t", category: ["お知らせ"], articleType: "獲得" };
    const out = normalizeColumnsSelectFields("news", payload);
    // news では articleType を配列化せずそのまま(そもそも付かない想定だが破壊しない)
    expect(out.articleType).toBe("獲得");
    expect(out.category).toEqual(["お知らせ"]);
  });

  it("元の payload を破壊せず新オブジェクトを返す(immutable)", () => {
    const payload = { articleType: "獲得" };
    const out = normalizeColumnsSelectFields("columns", payload);
    expect(payload.articleType).toBe("獲得");
    expect(out).not.toBe(payload);
  });

  it("locale/displayMode など既存の配列フィールドは触らない", () => {
    const out = normalizeColumnsSelectFields("columns", {
      articleType: "比較",
      locale: ["ja"],
      displayMode: ["html"],
    });
    expect(out.articleType).toEqual(["比較"]);
    expect(out.locale).toEqual(["ja"]);
    expect(out.displayMode).toEqual(["html"]);
  });
});
