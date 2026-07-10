import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { sanitizeNewsHtml, STRICT_HTML_CONFIG } from "@/lib/news/sanitize";

import { extractPromptHeadings, renderPromptMarkdown } from "./promptMarkdown";

describe("renderPromptMarkdown", () => {
  it("見出し(# / ##)を h1 / h2 に整形する", () => {
    const html = renderPromptMarkdown("# 大見出し\n\n## 小見出し");
    expect(html).toContain("<h1>大見出し</h1>");
    expect(html).toContain("<h2");
    expect(html).toContain(">小見出し</h2>");
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
    expect(html).toContain("<h2");
    expect(html).toContain(">次</h2>");
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

  it("登録済みrepo相対リンクは同じプロンプトタブの doc query へ変換する", () => {
    // news sanitizer が共有 DOMPurify へ登録する href hook と同居する実運用順を再現する。
    sanitizeNewsHtml("<p>記事</p>", STRICT_HTML_CONFIG);
    const html = renderPromptMarkdown("[canon](../operations/growth/00-canon.md)", {
      currentPath: "docs/operations/growth-weekly-runbook.md",
      registeredPaths: new Set(["docs/operations/growth/00-canon.md"]),
    });
    expect(html).toContain('data-doc-path="docs/operations/growth/00-canon.md"');
    expect(html).toContain(
      'href="/growth/approve?view=prompt&amp;doc=docs%2Foperations%2Fgrowth%2F00-canon.md"',
    );
    const template = document.createElement("template");
    template.innerHTML = html;
    expect(template.content.querySelector("a")?.getAttribute("href")).toBe(
      "/growth/approve?view=prompt&doc=docs%2Foperations%2Fgrowth%2F00-canon.md",
    );
  });

  it("専用sanitizerはjavascript hrefを絶対に残さない", () => {
    const html = renderPromptMarkdown("[危険](javascript:alert(1))");
    const template = document.createElement("template");
    template.innerHTML = html;
    expect(template.content.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(html).not.toContain("javascript:");
  });

  it("登録済みリンクはfragmentと許可queryを同一オリジンURLへ保持する", () => {
    const html = renderPromptMarkdown("[canon](../operations/growth/00-canon.md?raw=1#禁止事項)", {
      currentPath: "docs/operations/growth-weekly-runbook.md",
      registeredPaths: new Set(["docs/operations/growth/00-canon.md"]),
    });
    expect(html).toContain(
      'href="/growth/approve?view=prompt&amp;doc=docs%2Foperations%2Fgrowth%2F00-canon.md&amp;raw=1#%E7%A6%81%E6%AD%A2%E4%BA%8B%E9%A0%85"',
    );
  });

  it("外部URLは通常リンクのまま、未登録repo相対リンクはブラウザ相対URLにしない", () => {
    const html = renderPromptMarkdown(
      "[外部](https://example.com/a) [未登録](docs/operations/missing.md)",
      {
        currentPath: "scripts/growth/prompts/weekly.md",
        registeredPaths: new Set(["docs/operations/growth/00-canon.md"]),
      },
    );
    expect(html).toContain('href="https://example.com/a"');
    expect(html).not.toContain('href="docs/operations/missing.md"');
    expect(html).toContain('data-missing-doc-path="docs/operations/missing.md"');
  });

  it("H2/H3 目次用の見出しを抽出する", () => {
    expect(extractPromptHeadings("# H1\n\n## H2\n\n### H3\n\n#### H4")).toEqual([
      { id: "h2", level: 2, text: "H2" },
      { id: "h3", level: 3, text: "H3" },
    ]);
  });

  it("コードフェンス内の##は目次に含めずrendererのIDと一致する", () => {
    const source = "## 本文\n\n```md\n## コード例\n```\n\n### 本文詳細";
    const headings = extractPromptHeadings(source);
    const html = renderPromptMarkdown(source);
    expect(headings).toEqual([
      { id: "本文", level: 2, text: "本文" },
      { id: "本文詳細", level: 3, text: "本文詳細" },
    ]);
    for (const heading of headings) {
      expect(html).toContain(`id="${heading.id}"`);
      expect(html).toContain("scroll-mt-64");
    }
    expect(headings.some((heading) => heading.text === "コード例")).toBe(false);
  });

  it("article-idea実例のコードフェンス内見出しを目次に混ぜない", () => {
    const source = readFileSync("scripts/growth/prompts/shared/article-idea.md", "utf8");
    const headings = extractPromptHeadings(source);
    expect(headings.map((heading) => heading.text)).not.toContain("市川でできる場所は3つ");
    expect(headings.map((heading) => heading.text)).toContain("構成案の書式");
  });
});
