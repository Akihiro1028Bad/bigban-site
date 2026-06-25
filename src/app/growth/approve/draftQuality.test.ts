import { describe, expect, it } from "vitest";

import { draftQuality, QUALITY_THRESHOLDS } from "./draftQuality";

function pick(checks: ReturnType<typeof draftQuality>, label: string) {
  const found = checks.find((c) => c.label === label);
  if (!found) throw new Error(`check not found: ${label}`);
  return found;
}

describe("draftQuality", () => {
  it("十分な下書きは全項目 ok", () => {
    const body = "あ".repeat(QUALITY_THRESHOLDS.minChars);
    const bodyHtml =
      "<h2>見出し1</h2><h2>見出し2</h2>" +
      "<figure><img src='x'></figure>" +
      '<a href="https://thepicklebang.com/news/a">内部</a>';
    const checks = draftQuality({ bodyHtml, body, title: "短いタイトル" });
    expect(pick(checks, "文字数").ok).toBe(true);
    expect(pick(checks, "見出し").ok).toBe(true);
    expect(pick(checks, "画像").ok).toBe(true);
    expect(pick(checks, "内部リンク").ok).toBe(true);
    expect(pick(checks, "タイトル長").ok).toBe(true);
  });

  it("不足している下書きは warn(ok=false)", () => {
    const checks = draftQuality({
      bodyHtml: "<p>短い</p>",
      body: "短い",
      title: "あ".repeat(QUALITY_THRESHOLDS.maxTitleLen + 1),
    });
    expect(pick(checks, "文字数").ok).toBe(false);
    expect(pick(checks, "見出し").ok).toBe(false);
    expect(pick(checks, "画像").ok).toBe(false); // 0/3
    expect(pick(checks, "内部リンク").ok).toBe(false); // 0
    expect(pick(checks, "タイトル長").ok).toBe(false); // 長すぎ
    expect(pick(checks, "画像").value).toBe("0 / 3");
  });

  it("h2/h3 を見出しとして数える", () => {
    const checks = draftQuality({ bodyHtml: "<h2>A</h2><h3>B</h3>", body: "x", title: "t" });
    expect(pick(checks, "見出し").value).toBe("2");
  });

  it("内部リンクは thepicklebang.com とルート相対(/...)を数え、外部は除く", () => {
    const bodyHtml =
      '<a href="https://thepicklebang.com/x">in1</a>' +
      '<a href="/news/y">in2</a>' +
      '<a href="https://example.com/z">外部</a>';
    const checks = draftQuality({ bodyHtml, body: "x", title: "t" });
    expect(pick(checks, "内部リンク").value).toBe("2");
  });

  it("body が空なら bodyHtml からタグを除いて文字数を数える", () => {
    const bodyHtml = `<p>${"あ".repeat(QUALITY_THRESHOLDS.minChars)}</p>`;
    const checks = draftQuality({ bodyHtml, body: "", title: "t" });
    expect(pick(checks, "文字数").ok).toBe(true);
  });

  it("文字数は境界値(minChars)で ok", () => {
    const body = "あ".repeat(QUALITY_THRESHOLDS.minChars);
    const checks = draftQuality({ bodyHtml: "", body, title: "t" });
    expect(pick(checks, "文字数").ok).toBe(true);
  });
});
