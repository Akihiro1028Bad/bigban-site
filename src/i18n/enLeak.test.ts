import { describe, expect, it } from "vitest";

import enMessages from "../../messages/en.json";

// ひらがな・カタカナ・漢字・半角カナ。全角記号(／ 〇 など)は対象外。
const JAPANESE_CHARS = /[぀-ヿ一-鿿ｦ-ﾟ]/;

// 英語ページ上でも、LaBOLA の日本語ボタン名は引用して見せる必要がある。
// 引用してよいボタン名だけを許可し、それ以外の和文は漏れとして扱う。
const QUOTED_BUTTON_LABELS = ["ビジターで予約"] as const;

function stripQuotedLabels(text: string): string {
  return QUOTED_BUTTON_LABELS.reduce(
    (acc, label) => acc.split(label).join(""),
    text,
  );
}

function collectJapanesePaths(value: unknown, path: string, out: string[]): void {
  if (typeof value === "string") {
    if (JAPANESE_CHARS.test(stripQuotedLabels(value))) out.push(`${path} => ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectJapanesePaths(item, `${path}[${i}]`, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectJapanesePaths(child, path === "" ? key : `${path}.${key}`, out);
    }
  }
}

describe("messages/en.json", () => {
  it("英語ページに表示される文言に日本語文字が含まれない", () => {
    const leaks: string[] = [];
    collectJapanesePaths(enMessages, "", leaks);
    expect(leaks).toEqual([]);
  });
});
