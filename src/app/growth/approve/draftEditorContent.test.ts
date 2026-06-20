// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildDraftEditPayload,
  DRAFT_DECORATIONS,
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

describe("DRAFT_DECORATIONS", () => {
  it("許可クラス装飾のカタログ(className/label)を提供する", () => {
    const classNames = DRAFT_DECORATIONS.map((d) => d.className);
    expect(classNames).toContain("lead");
    expect(classNames).toContain("note");
    expect(DRAFT_DECORATIONS.every((d) => d.label.length > 0)).toBe(true);
  });
});
