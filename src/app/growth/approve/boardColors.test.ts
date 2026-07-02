import { describe, expect, it } from "vitest";

import { stageTheme } from "./boardColors";

describe("stageTheme", () => {
  it("段階ごとに別系統の accent 色を返す(提案=Blue/生成待ち=Amber/生成中=Purple/下書き=Teal)", () => {
    expect(stageTheme("proposed").accent).toContain("blue");
    expect(stageTheme("queued").accent).toContain("amber");
    expect(stageTheme("generating").accent).toContain("purple");
    expect(stageTheme("drafted").accent).toContain("teal");
  });

  it("却下は中立(gray)にフォールバックする", () => {
    expect(stageTheme("rejected").accent).toContain("gray");
  });

  it("accent は左ボーダー(border-l)の段階アクセントを返す", () => {
    const theme = stageTheme("proposed");
    expect(theme.accent.length).toBeGreaterThan(0);
    expect(stageTheme("drafted").accent).toContain("border-l");
  });
});
