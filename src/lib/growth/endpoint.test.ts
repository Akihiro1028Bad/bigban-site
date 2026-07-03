// @vitest-environment node
import { describe, expect, it } from "vitest";

import { growthArticleSegment, growthEndpoint } from "@/lib/growth/endpoint";

describe("growthArticleSegment", () => {
  it("env 未設定なら news(現行互換)", () => {
    expect(growthArticleSegment({})).toBe("news");
  });

  it("endpoint=columns なら columns セグメント", () => {
    expect(
      growthArticleSegment({ GROWTH_MICROCMS_ENDPOINT: "columns" }),
    ).toBe("columns");
  });

  it("未知 endpoint は news にフォールバック(URL 破損を避ける)", () => {
    expect(
      growthArticleSegment({ GROWTH_MICROCMS_ENDPOINT: "blog" }),
    ).toBe("news");
  });
});

describe("growthEndpoint", () => {
  it("env 未設定なら news(現行互換)にフォールバックする", () => {
    expect(growthEndpoint({})).toBe("news");
  });

  it("GROWTH_MICROCMS_ENDPOINT が設定されていればその値を返す", () => {
    expect(growthEndpoint({ GROWTH_MICROCMS_ENDPOINT: "columns" })).toBe(
      "columns",
    );
  });

  it("前後の空白は trim する", () => {
    expect(
      growthEndpoint({ GROWTH_MICROCMS_ENDPOINT: "  columns  " }),
    ).toBe("columns");
  });

  it("空文字は news にフォールバックする", () => {
    expect(growthEndpoint({ GROWTH_MICROCMS_ENDPOINT: "" })).toBe("news");
  });

  it("空白のみは news にフォールバックする", () => {
    expect(growthEndpoint({ GROWTH_MICROCMS_ENDPOINT: "   " })).toBe("news");
  });

  it("引数省略時は process.env を参照する", () => {
    const prev = process.env.GROWTH_MICROCMS_ENDPOINT;
    try {
      delete process.env.GROWTH_MICROCMS_ENDPOINT;
      expect(growthEndpoint()).toBe("news");
      process.env.GROWTH_MICROCMS_ENDPOINT = "columns";
      expect(growthEndpoint()).toBe("columns");
    } finally {
      if (prev === undefined) {
        delete process.env.GROWTH_MICROCMS_ENDPOINT;
      } else {
        process.env.GROWTH_MICROCMS_ENDPOINT = prev;
      }
    }
  });
});
