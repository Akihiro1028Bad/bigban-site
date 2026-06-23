import { describe, expect, it } from "vitest";

import { stageTheme } from "./boardColors";

describe("stageTheme", () => {
  it("段階ごとに別系統の色を返す(提案=Blue/生成待ち=Amber/生成中=Purple/下書き=Teal)", () => {
    expect(stageTheme("proposed").header).toContain("blue");
    expect(stageTheme("queued").header).toContain("amber");
    expect(stageTheme("generating").header).toContain("purple");
    expect(stageTheme("drafted").header).toContain("teal");
  });

  it("却下は中立(gray)にフォールバックする", () => {
    expect(stageTheme("rejected").header).toContain("gray");
  });

  it("header/accent/count の3クラスを返す", () => {
    const theme = stageTheme("proposed");
    expect(theme.header.length).toBeGreaterThan(0);
    expect(theme.accent.length).toBeGreaterThan(0);
    expect(theme.count.length).toBeGreaterThan(0);
  });

  it("accent は左ボーダーaccent、count は淡色バッジ", () => {
    expect(stageTheme("drafted").accent).toContain("border-l");
    expect(stageTheme("drafted").count).toContain("teal");
  });
});
