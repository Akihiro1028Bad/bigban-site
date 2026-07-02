import { describe, expect, it } from "vitest";

import { renderPromptMarkdown } from "./promptMarkdown";

describe("renderPromptMarkdown", () => {
  it("見出し(# / ##)を h1 / h2 に整形する", () => {
    const html = renderPromptMarkdown("# 大見出し\n\n## 小見出し");
    expect(html).toContain("<h1>大見出し</h1>");
    expect(html).toContain("<h2>小見出し</h2>");
  });

  it("箇条書きを ul / li に整形する", () => {
    const html = renderPromptMarkdown("- a\n- b");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>b</li>");
  });

  it("強調(**x**)を strong に整形する", () => {
    const html = renderPromptMarkdown("これは **強調** です");
    expect(html).toContain("<strong>強調</strong>");
  });

  it("フェンスコードを pre / code に整形する", () => {
    const html = renderPromptMarkdown("```\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  it("生の XML風タグはエスケープしてリテラル表示する(HTML化も除去もしない)", () => {
    const html = renderPromptMarkdown("次の <role> を守ること");
    // エスケープされた文字列として現れる
    expect(html).toContain("&lt;role&gt;");
    // 実際の <role> 要素にはならない(除去もされていない)
    expect(html).not.toContain("<role>");
  });

  it("引用符・アンパサンドを含む生タグも全てエスケープしタグ化しない", () => {
    const html = renderPromptMarkdown('<img src="a.png" & alt="x">');
    // タグ区切り(< >)とアンパサンドはエスケープされ、実タグにはならない
    expect(html).toContain("&lt;img");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<img");
    // 属性値の引用符はテキストとして温存される(タグとして解釈されない)
    expect(html).toContain('src="a.png"');
  });

  it("<role> で囲まれたブロック内の Markdown も整形しつつタグはリテラル表示する", () => {
    const html = renderPromptMarkdown("<role>\n手順:\n\n- **A**\n- B\n</role>\n\n## 次\n");
    // 内部の箇条書き・強調が整形される
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
    expect(html).toContain("<strong>A</strong>");
    // ブロック外の見出しも整形される
    expect(html).toContain("<h2>次</h2>");
    // 構造タグはエスケープされてリテラル表示(除去もされない)
    expect(html).toContain("&lt;role&gt;");
    expect(html).toContain("&lt;/role&gt;");
    expect(html).not.toContain("<role>");
    expect(html).not.toContain("</role>");
  });

  it("リンクを a 要素に整形する", () => {
    const html = renderPromptMarkdown("[t](http://x)");
    expect(html).toContain('<a href="http://x"');
    expect(html).toContain(">t</a>");
  });
});
