import { describe, expect, it } from "vitest";

import enMessages from "../../messages/en.json";

// ひらがな・カタカナ・漢字・半角カナ。全角記号(／ 〇 など)は対象外。
const JAPANESE_CHARS = /[぀-ヿ一-鿿ｦ-ﾟ]/;

// 英語ページ上でも日本語ボタン名を引用して見せる必要がある場所だけ許可する。
const ALLOWED_PATH_PREFIXES = ["Reserve.englishGuide."] as const;

function collectJapanesePaths(value: unknown, path: string, out: string[]): void {
  if (typeof value === "string") {
    const isAllowed = ALLOWED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
    if (!isAllowed && JAPANESE_CHARS.test(value)) out.push(`${path} => ${value}`);
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
