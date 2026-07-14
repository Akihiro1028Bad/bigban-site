import { describe, expect, it } from "vitest";

import {
  evaluateOutlineCompliance,
  outlineFromPage,
} from "./outlineCompliance";

describe("evaluateOutlineCompliance", () => {
  const outline = [
    "## はじめに",
    "狙いです。",
    "### 選び方",
    "説明です。",
    "## まとめ:自分に合う場所",
  ].join("<br>");

  it("H2/H3のレベル・名前・順序が一致すれば通す", () => {
    const result = evaluateOutlineCompliance(
      outline,
      "<h2>はじめに</h2><p>本文</p><h3>選び方</h3><h2>まとめ: 自分に合う場所</h2>"
    );

    expect(result).toEqual({ ok: true, blockReasons: [] });
  });

  it("構成案の見出しが欠落していれば止める", () => {
    const result = evaluateOutlineCompliance(outline, "<h2>はじめに</h2>");

    expect(result.ok).toBe(false);
    expect(result.blockReasons.join(" ")).toContain("見出し数");
  });

  it("見出しの順序が違えば止める", () => {
    const result = evaluateOutlineCompliance(
      outline,
      "<h2>まとめ:自分に合う場所</h2><h2>はじめに</h2><h3>選び方</h3>"
    );

    expect(result.ok).toBe(false);
    expect(result.blockReasons.join(" ")).toContain("1番目");
  });

  it("見出しレベルが違えば止める", () => {
    const result = evaluateOutlineCompliance(
      outline,
      "<h2>はじめに</h2><h2>選び方</h2><h2>まとめ:自分に合う場所</h2>"
    );

    expect(result.ok).toBe(false);
    expect(result.blockReasons.join(" ")).toContain("H3");
  });

  it("未承認の追加見出しがあれば止める", () => {
    const result = evaluateOutlineCompliance(
      outline,
      "<h2>はじめに</h2><h3>選び方</h3><h2>追加</h2><h2>まとめ:自分に合う場所</h2>"
    );

    expect(result.ok).toBe(false);
    expect(result.blockReasons.join(" ")).toContain("見出し数");
  });

  it("末尾に自動生成された参考資料だけは許可する", () => {
    const result = evaluateOutlineCompliance(
      outline,
      "<h2>はじめに</h2><h3>選び方</h3><h2>まとめ:自分に合う場所</h2><h2>参考資料</h2>",
      { allowGeneratedReferences: true }
    );

    expect(result).toEqual({ ok: true, blockReasons: [] });
  });

  it("参考資料の生成条件を満たさなければ末尾でも止める", () => {
    const result = evaluateOutlineCompliance(
      outline,
      "<h2>はじめに</h2><h3>選び方</h3><h2>まとめ:自分に合う場所</h2><h2>参考資料</h2>"
    );

    expect(result.ok).toBe(false);
  });

  it("構成案に参考資料がある場合は重複を許可しない", () => {
    const result = evaluateOutlineCompliance(
      `${outline}<br>## 参考資料`,
      "<h2>はじめに</h2><h3>選び方</h3><h2>まとめ:自分に合う場所</h2><h2>参考資料</h2><h2>参考資料</h2>",
      { allowGeneratedReferences: true }
    );

    expect(result.ok).toBe(false);
  });

  it("参考資料が末尾以外なら止める", () => {
    const result = evaluateOutlineCompliance(
      outline,
      "<h2>参考資料</h2><h2>はじめに</h2><h3>選び方</h3><h2>まとめ:自分に合う場所</h2>"
    );

    expect(result.ok).toBe(false);
  });

  it("構成案が空または見出しなしなら安全側で止める", () => {
    expect(evaluateOutlineCompliance("", "<h2>A</h2>").ok).toBe(false);
    expect(evaluateOutlineCompliance("説明だけ", "<h2>A</h2>").ok).toBe(false);
  });

  it("HTMLエンティティと見出し内タグを正規化する", () => {
    const result = evaluateOutlineCompliance(
      "## A & B\n## 使い方",
      "<h2>A &amp; B</h2><h2><strong>使い方</strong></h2>"
    );

    expect(result.ok).toBe(true);
  });

  it("10進・16進の数値参照を復号し、未知の名前参照は保持する", () => {
    const result = evaluateOutlineCompliance(
      "## A B C &unknown;",
      "<h2>&#65; &#x42; &#X43; &unknown;</h2>"
    );

    expect(result.ok).toBe(true);
  });
});

describe("outlineFromPage", () => {
  it("分割されたNotion rich_textを連結する", () => {
    expect(
      outlineFromPage({
        id: "page-1",
        url: "",
        properties: {
          "構成案": { rich_text: [{ plain_text: "## A" }, { plain_text: "\n## B" }] },
        },
      })
    ).toBe("## A\n## B");
  });

  it("プロパティ欠落やplain_text欠落は空文字にする", () => {
    expect(outlineFromPage({ id: "p", url: "", properties: {} })).toBe("");
    expect(
      outlineFromPage({
        id: "p",
        url: "",
        properties: { "構成案": { rich_text: [{}] } },
      })
    ).toBe("");
  });
});
