// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildDraftEditPayload,
  DECORATION_OPTIONS,
  sanitizeDraftHtml,
} from "./draftEditorContent";

describe("sanitizeDraftHtml", () => {
  it("許可外タグ(script)を除去し、許可タグは残す", () => {
    const out = sanitizeDraftHtml("<p>本文</p><script>alert(1)</script>");
    expect(out).toContain("本文");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("見出し・リスト・強調などの装飾は維持する", () => {
    const out = sanitizeDraftHtml("<h2>見出し</h2><ul><li><strong>太字</strong></li></ul>");
    expect(out).toContain("<h2>見出し</h2>");
    expect(out).toContain("<strong>太字</strong>");
    expect(out).toContain("<li>");
  });
});

describe("buildDraftEditPayload", () => {
  it("pageId と 正規化した bodyHtml を返す", () => {
    const payload = buildDraftEditPayload("page-1", "<p>ok</p><script>x</script>");
    expect(payload.pageId).toBe("page-1");
    expect(payload.bodyHtml).toContain("ok");
    expect(payload.bodyHtml).not.toContain("script");
  });
});

describe("DECORATION_OPTIONS", () => {
  it("装飾カタログ(key/label/kind)を提供する", () => {
    const keys = DECORATION_OPTIONS.map((d) => d.key);
    expect(keys).toEqual(["lead", "note", "caution", "highlight", "badge", "mark"]);
    expect(DECORATION_OPTIONS.every((d) => d.label.length > 0)).toBe(true);
    expect(DECORATION_OPTIONS.every((d) => ["block", "paragraph", "inline"].includes(d.kind))).toBe(
      true
    );
  });

  it("note/caution/highlight は #147 と同じ aside.<variant> の HTML 例にする", () => {
    const blocks = DECORATION_OPTIONS.filter((d) => d.kind === "block");
    for (const d of blocks) {
      expect(d.sampleHtml).toBe(`<aside class="${d.key}"><p>本文</p></aside>`);
    }
  });

  it("各装飾の HTML は STRICT サニタイズを往復しても消えない(保存後も残る)", () => {
    for (const d of DECORATION_OPTIONS) {
      const out = sanitizeDraftHtml(d.sampleHtml);
      if (d.kind === "block") {
        expect(out).toContain(`<aside class="${d.key}">`);
      } else if (d.key === "lead") {
        expect(out).toContain('class="lead"');
      } else if (d.key === "badge") {
        expect(out).toContain('class="badge"');
      } else if (d.key === "mark") {
        expect(out).toContain("<mark>");
      }
      expect(out).toContain("本文");
    }
  });
});
