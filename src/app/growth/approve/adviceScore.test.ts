import { describe, expect, it } from "vitest";

import { overallFromScores } from "./adviceScore";

describe("overallFromScores", () => {
  it("観点スコア(0-5)の平均×20で0-100を返す", () => {
    expect(overallFromScores([{ score: 5 }, { score: 4 }, { score: 3 }])).toBe(80);
  });
  it("単一スコアも平均×20", () => {
    expect(overallFromScores([{ score: 4 }])).toBe(80);
  });
  it("四捨五入して整数を返す", () => {
    // 平均 (5+4)/2=4.5 → ×20 = 90
    expect(overallFromScores([{ score: 5 }, { score: 4 }])).toBe(90);
    // 平均 (3+4+3)/3=3.333.. → ×20 = 66.66.. → 67
    expect(overallFromScores([{ score: 3 }, { score: 4 }, { score: 3 }])).toBe(67);
  });
  it("空配列は0", () => {
    expect(overallFromScores([])).toBe(0);
  });
  it("全0は0", () => {
    expect(overallFromScores([{ score: 0 }, { score: 0 }])).toBe(0);
  });
});
