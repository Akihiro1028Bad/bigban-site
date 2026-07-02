import { describe, expect, it } from "vitest";

import { buildPreviewHtml } from "./previewHtml";

describe("buildPreviewHtml", () => {
  it("アイキャッチが無ければ bodyHtml をそのまま返す", () => {
    expect(buildPreviewHtml("<p>本文</p>")).toBe("<p>本文</p>");
    expect(buildPreviewHtml("<p>本文</p>", "")).toBe("<p>本文</p>");
  });

  it("アイキャッチがあれば bodyHtml の前にヒーロー img を差し込む", () => {
    const out = buildPreviewHtml("<p>本文</p>", "https://img.example/a.webp");
    expect(out.startsWith('<div style="margin-bottom:24px">')).toBe(true);
    expect(out).toContain('<img src="https://img.example/a.webp"');
    expect(out.endsWith("<p>本文</p>")).toBe(true);
    // ヒーローが本文より前にある
    expect(out.indexOf("<img")).toBeLessThan(out.indexOf("<p>本文</p>"));
  });

  it("url の特殊文字を属性エスケープする(url はそのまま・変換は付けない)", () => {
    const out = buildPreviewHtml(
      "<p>b</p>",
      'https://x/y?w=1200&h=8"<>',
    );
    expect(out).toContain(
      '<img src="https://x/y?w=1200&amp;h=8&quot;&lt;&gt;"',
    );
    expect(out).not.toContain('&h=8"');
  });
});
