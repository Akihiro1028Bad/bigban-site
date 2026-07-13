// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  decodeHtmlEntities,
  normalizeHtmlAnchorText,
  normalizePlainAnchorText,
} from "./htmlText";

describe("decodeHtmlEntities", () => {
  it("既知の名前付き実体参照をデコードする", () => {
    expect(decodeHtmlEntities("A &amp; B&nbsp;C")).toBe("A & B C");
  });

  it("未知の名前付き実体参照と通常文字列はそのまま返す", () => {
    expect(decodeHtmlEntities("&foo; 通常文字列")).toBe("&foo; 通常文字列");
  });

  it("10進と大文字小文字の16進数値実体参照をデコードする", () => {
    expect(decodeHtmlEntities("&#38; &#x26; &#X26;")).toBe("& & &");
  });

  it("範囲外の数値実体参照はそのまま返す", () => {
    expect(decodeHtmlEntities("&#0; &#99999999;")).toBe("&#0; &#99999999;");
  });

  it("数値変換が不正な場合は実体参照をそのまま返す", () => {
    const parseIntSpy = vi.spyOn(Number, "parseInt").mockReturnValueOnce(Number.NaN);
    expect(decodeHtmlEntities("&#38;")).toBe("&#38;");
    parseIntSpy.mockRestore();
  });
});

describe("normalizeHtmlAnchorText", () => {
  it("brを空白化し、タグを除去する", () => {
    expect(normalizeHtmlAnchorText("<p>前<br>中<br/>後</p>")).toBe("前 中 後");
  });

  it("実体参照をデコードし、NBSPを半角空白に畳む", () => {
    expect(normalizeHtmlAnchorText("<p>A &amp; B</p>")).toBe("A & B");
    expect(normalizeHtmlAnchorText("初心者&nbsp;歓迎")).toBe("初心者 歓迎");
  });

  it("NFKCで全角・互換文字を正規化する", () => {
    expect(normalizeHtmlAnchorText("Ｑ＆Ａ")).toBe("Q&A");
  });

  it("前後空白を除去し、連続する空白類を畳む", () => {
    expect(normalizeHtmlAnchorText("  A\t\n\u200bB  ")).toBe("A B");
  });

  it("空文字は空文字を返す", () => {
    expect(normalizeHtmlAnchorText("")).toBe("");
  });
});

describe("normalizePlainAnchorText", () => {
  it("プレーンテキストの実体参照風文字列と不等号をそのまま保持する", () => {
    expect(normalizePlainAnchorText("Use &amp; and 1 < 2 > 0")).toBe("Use &amp; and 1 < 2 > 0");
  });

  it("空白と互換文字だけを正規化する", () => {
    expect(normalizePlainAnchorText("  Ｑ＆Ａ\tです  ")).toBe("Q&A です");
  });
});
