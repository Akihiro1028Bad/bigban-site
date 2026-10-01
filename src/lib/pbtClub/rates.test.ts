import { describe, it, expect } from "vitest";
import {
  PBT_CLUB_COMPARISON_HOURS,
  PBT_CLUB_PEAK_ROW,
  PBT_CLUB_RATE_ROWS,
  PBT_CLUB_RATE_SUMMARY,
} from "./rates";

describe("PBT CLUB の共通料金行", () => {
  it("確定料金から4行を作り、集計を返す", () => {
    expect(PBT_CLUB_RATE_ROWS).toHaveLength(4);
    expect(PBT_CLUB_RATE_SUMMARY.memberMinYen).toBe(2800);
  });

  it("最も通常料金が高い行を平日夜・土日祝として返す", () => {
    expect(PBT_CLUB_PEAK_ROW.normalYen).toBe(7980);
    expect(PBT_CLUB_PEAK_ROW.breakEvenHours).toBe(5);
  });

  it("比較例の利用時間は公開記事と同じ 4/5/8 時間", () => {
    expect(PBT_CLUB_COMPARISON_HOURS).toEqual([4, 5, 8]);
  });
});
