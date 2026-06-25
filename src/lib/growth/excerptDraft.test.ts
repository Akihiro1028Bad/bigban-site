import { describe, expect, it } from "vitest";

import { autoExcerpt, EXCERPT_MAX, isExcerptTooLong } from "./excerptDraft";

describe("autoExcerpt", () => {
  it("上限以内はそのまま(空白は正規化)", () => {
    expect(autoExcerpt("市川の  屋内コートで\n打てる")).toBe("市川の 屋内コートで 打てる");
  });

  it("上限超過は max-1 で切って省略記号を付ける", () => {
    const long = "あ".repeat(EXCERPT_MAX + 50);
    const out = autoExcerpt(long);
    expect(out.length).toBe(EXCERPT_MAX);
    expect(out.endsWith("…")).toBe(true);
  });

  it("max は指定で上書きできる", () => {
    expect(autoExcerpt("abcdef", 3)).toBe("ab…");
  });
});

describe("isExcerptTooLong", () => {
  it("上限以内は false、超過は true", () => {
    expect(isExcerptTooLong("あ".repeat(EXCERPT_MAX))).toBe(false);
    expect(isExcerptTooLong("あ".repeat(EXCERPT_MAX + 1))).toBe(true);
  });
});
