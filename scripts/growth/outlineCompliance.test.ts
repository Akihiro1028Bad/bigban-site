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
    expect(
      evaluateOutlineCompliance(
        outline,
        "<h2>はじめに</h2><p>本文</p><h3>選び方</h3><h2>まとめ: 自分に合う場所</h2>"
      )
    ).toEqual({ ok: true, blockReasons: [] });
  });

  it("欠落・追加・順序違い・レベル違いを止める", () => {
    expect(evaluateOutlineCompliance(outline, "<h2>はじめに</h2>").ok).toBe(false);
    expect(
      evaluateOutlineCompliance(
        outline,
        "<h2>まとめ:自分に合う場所</h2><h2>はじめに</h2><h3>選び方</h3>"
      ).blockReasons.join(" ")
    ).toContain("1番目");
    expect(
      evaluateOutlineCompliance(
        outline,
        "<h2>はじめに</h2><h2>選び方</h2><h2>まとめ:自分に合う場所</h2>"
      ).blockReasons.join(" ")
    ).toContain("H3");
    expect(
      evaluateOutlineCompliance(
        outline,
        "<h2>はじめに</h2><h3>選び方</h3><h2>追加</h2><h2>まとめ:自分に合う場所</h2>"
      ).ok
    ).toBe(false);
  });

  it("条件を満たす末尾の参考資料だけは許可する", () => {
    const html =
      "<h2>はじめに</h2><h3>選び方</h3><h2>まとめ:自分に合う場所</h2><h2>参考資料</h2>";
    expect(
      evaluateOutlineCompliance(outline, html, { allowGeneratedReferences: true }).ok
    ).toBe(true);
    expect(evaluateOutlineCompliance(outline, html).ok).toBe(false);
    expect(
      evaluateOutlineCompliance(
        `${outline}<br>## 参考資料`,
        `${html}<h2>参考資料</h2>`,
        { allowGeneratedReferences: true }
      ).ok
    ).toBe(false);
  });

  it("空の構成案は止め、HTMLエンティティとタグを正規化する", () => {
    expect(evaluateOutlineCompliance("", "<h2>A</h2>").ok).toBe(false);
    expect(
      evaluateOutlineCompliance(
        "## A & B\n## 使い方\n## A B C &unknown;",
        "<h2>A &amp; B</h2><h2><strong>使い方</strong></h2><h2>&#65; &#x42; &#X43; &unknown;</h2>"
      ).ok
    ).toBe(true);
  });
});

describe("outlineFromPage", () => {
  it("Notionの分割rich_textを連結し、欠落時は空にする", () => {
    expect(
      outlineFromPage({
        id: "page-1",
        url: "",
        properties: {
          "構成案": { rich_text: [{ plain_text: "## A" }, { plain_text: "\n## B" }] },
        },
      })
    ).toBe("## A\n## B");
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
