// @vitest-environment node
import { describe, expect, it } from "vitest";

import { EARLY_START_TIME, MILESTONES, MILESTONE_STEP_AFTER_LAST, RULES } from "./config";

describe("config", () => {
  it("設計書の判定基準と一致する", () => {
    expect(EARLY_START_TIME).toBe("06:00");
    expect(RULES).toEqual({
      recentWindow: 8,
      regularMinInWindow: 4,
      dormantMisses: 4,
      dormantMinTotal: 3,
      newMaxTotal: 2,
    });
    expect(MILESTONES).toEqual([5, 10, 20, 30, 50]);
    expect(MILESTONE_STEP_AFTER_LAST).toBe(50);
  });
});
