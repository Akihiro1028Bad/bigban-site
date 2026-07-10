// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PROMPT_REGISTRY } from "./promptRegistry";

const PROMPTS_DIR = path.resolve("scripts/growth/prompts");

describe("週次分析の予約率中心プロンプト", () => {
  const weekly = readFileSync(path.join(PROMPTS_DIR, "weekly.md"), "utf-8");
  const goals = readFileSync(path.join(PROMPTS_DIR, "shared/growth-goals.md"), "utf-8");

  it("週次プロンプトが共通の目標・分析基準を参照する", () => {
    expect(weekly).toContain("scripts/growth/prompts/shared/growth-goals.md");
    expect(weekly).toContain("最大3件");
    expect(weekly).toContain("反証材料");
    expect(weekly).toContain("記事が有効");
  });

  it("共通基準が予約ファネルと実指標・代理指標を区別する", () => {
    expect(goals).toContain("認知 → 興味 → 予約意図 → 予約完了 → コート稼働 → 再予約・継続");
    expect(goals).toContain("コート予約率 = 予約済みコート枠 ÷ 販売可能コート枠");
    expect(goals).toContain("予約転換率 = 予約完了数 ÷ 予約ページ訪問数");
    expect(goals).toContain("予約意図率 = `/reserve` 到達数 ÷ サイト訪問数");
    expect(goals).toContain("比較データ不足");
    expect(goals).toContain("日本一");
  });

  it("承認画面のプロンプトタブで分析基準を参考資料として表示する", () => {
    expect(PROMPT_REGISTRY).toContainEqual(
      expect.objectContaining({
        filename: "growth-goals.md",
        group: "計測・学習",
      })
    );
  });
});
