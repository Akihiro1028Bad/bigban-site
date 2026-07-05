import { describe, expect, it } from "vitest";

import { removeAiDisclaimer } from "./aiDisclaimer";

const DISCLAIMER = "※この記事はAIが作成した下書きです。公開前に内容をご確認ください。";

describe("removeAiDisclaimer", () => {
  it("末尾の注記ブロックだけを除去し、他のブロックを保持する", () => {
    const input = `<h2>見出し</h2><p>本文です。</p><p>${DISCLAIMER}</p>`;

    const result = removeAiDisclaimer(input);

    expect(result).toEqual({
      body: "<h2>見出し</h2><p>本文です。</p>",
      removed: true,
    });
  });

  it("中間位置の注記ブロックだけを除去し、前後の段落を保持する", () => {
    const input = `<p>前の段落</p><p>${DISCLAIMER}</p><p>後の段落</p>`;

    const result = removeAiDisclaimer(input);

    expect(result.body).toBe("<p>前の段落</p><p>後の段落</p>");
    expect(result.removed).toBe(true);
  });

  it("タグ外の裸テキストにある注記行だけを除去する", () => {
    const input = `<p>本文</p>\n${DISCLAIMER}\n<p>続き</p>`;

    const result = removeAiDisclaimer(input);

    expect(result.body).toBe("<p>本文</p><p>続き</p>");
    expect(result.removed).toBe(true);
  });

  it("マーク不在なら入力と同じ文字列を返す", () => {
    const input = "<p>本文だけ</p>";

    const result = removeAiDisclaimer(input);

    expect(result.body).toBe(input);
    expect(result.removed).toBe(false);
  });

  it("既に除去済みの本文へ再適用しても無変更", () => {
    const input = "<p>本文</p><p>続き</p>";

    expect(removeAiDisclaimer(input)).toEqual({ body: input, removed: false });
  });

  it("注記ブロックが複数ある場合はすべて除去する", () => {
    const input = `<p>${DISCLAIMER}</p><p>本文</p><aside>${DISCLAIMER}</aside>`;

    const result = removeAiDisclaimer(input);

    expect(result).toEqual({ body: "<p>本文</p>", removed: true });
  });

  it("除去後に空ブロックや余分な連続改行を残さない", () => {
    const input = `<p>本文</p>\n<p>${DISCLAIMER}</p>\n<p></p>\n<p>続き</p>`;

    const result = removeAiDisclaimer(input);

    expect(result.body).toBe("<p>本文</p><p>続き</p>");
    expect(result.body).not.toContain("<p></p>");
    expect(result.body).not.toMatch(/\n{2,}/);
  });

  it("注記ブロック以外の段落内改行を保持する", () => {
    const input = `<p>foo\nbar</p><p>${DISCLAIMER}</p>`;

    const result = removeAiDisclaimer(input);

    expect(result.body).toBe("<p>foo\nbar</p>");
    expect(result.removed).toBe(true);
  });

  it("注記ブロック直後の改行と空白だけを残さない", () => {
    const input = `<p>本文</p><p>${DISCLAIMER}</p>\n  <p>続き</p>`;

    const result = removeAiDisclaimer(input);

    expect(result.body).toBe("<p>本文</p><p>続き</p>");
    expect(result.removed).toBe(true);
  });

  it("注記ブロックから離れた空ブロックは保持する", () => {
    const input = `<p></p><p>本文</p><p>${DISCLAIMER}</p>`;

    const result = removeAiDisclaimer(input);

    expect(result.body).toBe("<p></p><p>本文</p>");
    expect(result.removed).toBe(true);
  });

  it("空文字は無変更で返す", () => {
    expect(removeAiDisclaimer("")).toEqual({ body: "", removed: false });
  });

  it("巨大入力でも throw せず注記だけを除去する", () => {
    const body = "あ".repeat(30_000);
    const input = `<p>${body}</p><p>${DISCLAIMER}</p>`;

    expect(() => removeAiDisclaimer(input)).not.toThrow();
    expect(removeAiDisclaimer(input)).toEqual({ body: `<p>${body}</p>`, removed: true });
  });

  it("連続する注記ブロック(後始末範囲が重なる)をまとめて除去する", () => {
    const input = `<p>本文</p>\n<p>${DISCLAIMER}</p>\n<p>${DISCLAIMER}</p>`;

    expect(removeAiDisclaimer(input)).toEqual({ body: "<p>本文</p>", removed: true });
  });

  it("注記ブロック直前の空ブロックと空白も後始末として併呑する", () => {
    const input = `<p>本文</p><p></p>\n<p></p><p>${DISCLAIMER}</p>`;

    expect(removeAiDisclaimer(input)).toEqual({ body: "<p>本文</p>", removed: true });
  });

  it("最終ブロックの後ろにある裸テキストの注記行を除去する", () => {
    const input = `<p>本文</p>\n${DISCLAIMER}`;

    expect(removeAiDisclaimer(input)).toEqual({ body: "<p>本文</p>", removed: true });
  });

  it("タグ属性内だけにマークがある場合は本文を変更しない", () => {
    const input = `<p data-note="AIが作成した下書き">本文です。</p>`;

    expect(removeAiDisclaimer(input)).toEqual({ body: input, removed: false });
  });
});
