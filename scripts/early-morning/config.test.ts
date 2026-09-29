// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  CLASS_BY_WEEKDAY,
  CLASS_RULES,
  EARLY_START_TIME,
  EXCLUDED_TB_USER_IDS,
  MILESTONES,
  MILESTONE_STEP_AFTER_LAST,
  NOTE_LONG_GAP_DAYS,
  RULES,
} from "./config";

describe("config", () => {
  it("設計書(14章)の判定基準と一致する", () => {
    expect(EARLY_START_TIME).toBe("06:00");
    expect(RULES).toEqual({ newMaxTotal: 2 });
    expect(CLASS_RULES).toEqual({ recentWindow: 4, regularMin: 3, dormantMisses: 4, dormantMinTotal: 3, perfectMin: 3 });
    expect(NOTE_LONG_GAP_DAYS).toBe(28);
    expect(MILESTONES).toEqual([5, 10, 20, 30, 50]);
    expect(MILESTONE_STEP_AFTER_LAST).toBe(50);
  });

  it("曜日番号からクラスを引く(火=2、木=4)", () => {
    expect(CLASS_BY_WEEKDAY).toEqual({ 2: "初中級", 4: "中級以上" });
  });

  it("追加の除外スタッフは初期値では空", () => {
    expect(EXCLUDED_TB_USER_IDS).toEqual([]);
  });
});
