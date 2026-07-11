// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  growthArticleSegment,
  growthEndpoint,
  growthMediaForRow,
} from "@/lib/growth/endpoint";

describe("growthEndpoint (media 軸・#media)", () => {
  describe("column(既定・後方互換)", () => {
    it("env 未設定なら news(現行互換)にフォールバックする", () => {
      expect(growthEndpoint("column", {})).toBe("news");
    });

    it("GROWTH_MICROCMS_ENDPOINT が設定されていればその値を返す", () => {
      expect(
        growthEndpoint("column", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
      ).toBe("columns");
    });

    it("前後の空白は trim する", () => {
      expect(
        growthEndpoint("column", { GROWTH_MICROCMS_ENDPOINT: "  columns  " }),
      ).toBe("columns");
    });

    it("空文字は news にフォールバックする", () => {
      expect(growthEndpoint("column", { GROWTH_MICROCMS_ENDPOINT: "" })).toBe(
        "news",
      );
    });

    it("空白のみは news にフォールバックする", () => {
      expect(growthEndpoint("column", { GROWTH_MICROCMS_ENDPOINT: "   " })).toBe(
        "news",
      );
    });

    it("media 省略時は column 扱い(既存呼び出しの挙動不変)", () => {
      expect(growthEndpoint(undefined, {})).toBe("news");
      expect(
        growthEndpoint(undefined, { GROWTH_MICROCMS_ENDPOINT: "columns" }),
      ).toBe("columns");
    });
  });

  describe("news(常に news・env に依らない)", () => {
    it("env が columns でも news は news 固定", () => {
      expect(
        growthEndpoint("news", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
      ).toBe("news");
    });

    it("env 未設定でも news", () => {
      expect(growthEndpoint("news", {})).toBe("news");
    });
  });

  it("引数省略時は process.env を参照する(column 既定)", () => {
    const prev = process.env.GROWTH_MICROCMS_ENDPOINT;
    try {
      delete process.env.GROWTH_MICROCMS_ENDPOINT;
      expect(growthEndpoint()).toBe("news");
      process.env.GROWTH_MICROCMS_ENDPOINT = "columns";
      expect(growthEndpoint()).toBe("columns");
      // news は env を無視して news 固定。
      expect(growthEndpoint("news")).toBe("news");
    } finally {
      if (prev === undefined) {
        delete process.env.GROWTH_MICROCMS_ENDPOINT;
      } else {
        process.env.GROWTH_MICROCMS_ENDPOINT = prev;
      }
    }
  });
});

describe("growthArticleSegment (media 軸・#media)", () => {
  describe("column(既定)", () => {
    it("env 未設定なら news(現行互換)", () => {
      expect(growthArticleSegment("column", {})).toBe("news");
    });

    it("endpoint=columns なら columns セグメント", () => {
      expect(
        growthArticleSegment("column", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
      ).toBe("columns");
    });

    it("未知 endpoint は news にフォールバック(URL 破損を避ける)", () => {
      expect(
        growthArticleSegment("column", { GROWTH_MICROCMS_ENDPOINT: "blog" }),
      ).toBe("news");
    });

    it("media 省略時は column 扱い(既存呼び出しの挙動不変)", () => {
      expect(growthArticleSegment(undefined, {})).toBe("news");
      expect(
        growthArticleSegment(undefined, { GROWTH_MICROCMS_ENDPOINT: "columns" }),
      ).toBe("columns");
    });
  });

  describe("news(常に news)", () => {
    it("env が columns でも news セグメント固定", () => {
      expect(
        growthArticleSegment("news", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
      ).toBe("news");
    });
  });
});

describe("growthMediaForRow (Notion 行の 媒体 プロパティ解決・#media)", () => {
  it("『ニュース』は news", () => {
    expect(growthMediaForRow("ニュース")).toBe("news");
  });

  it("前後の空白を無視する", () => {
    expect(growthMediaForRow("  ニュース  ")).toBe("news");
  });

  it("『コラム』は column", () => {
    expect(growthMediaForRow("コラム")).toBe("column");
  });

  it("欠落(undefined/空)は column(完全後方互換)", () => {
    expect(growthMediaForRow(undefined)).toBe("column");
    expect(growthMediaForRow("")).toBe("column");
    expect(growthMediaForRow("   ")).toBe("column");
  });

  it("未知値は column にフォールバック(欠落耐性)", () => {
    expect(growthMediaForRow("blog")).toBe("column");
  });
});
