import { describe, it, expect } from "vitest";
import { COURT_PRICES } from "./pricing";

describe("COURT_PRICES", () => {
  it("6:00-9:00 / 9:00-17:00 / 17:00-23:00 の3時間帯を持つ", () => {
    expect(COURT_PRICES.map((row) => row.timeSlot)).toEqual([
      "6:00-9:00",
      "9:00-17:00",
      "17:00-23:00",
    ]);
  });

  it("通常料金（非会員）は据え置き", () => {
    expect(COURT_PRICES.map((row) => row.weekday)).toEqual([
      "¥4,980",
      "¥5,980",
      "¥7,980",
    ]);
    expect(COURT_PRICES.map((row) => row.weekend)).toEqual([
      "¥7,980",
      "¥7,980",
      "¥7,980",
    ]);
  });

  it("平日の PBT CLUB 会員価格を時間帯ごとに持つ", () => {
    expect(COURT_PRICES.map((row) => row.weekdayMember)).toEqual([
      "¥3,500",
      "¥4,200",
      "¥5,600",
    ]);
  });

  it("土日・祝日の PBT CLUB 会員価格は終日 ¥5,600", () => {
    expect(COURT_PRICES.map((row) => row.weekendMember)).toEqual([
      "¥5,600",
      "¥5,600",
      "¥5,600",
    ]);
  });

  it("すべての行で会員価格が通常料金より安い", () => {
    const toNumber = (price: string): number =>
      Number(price.replace(/[¥,]/g, ""));
    for (const row of COURT_PRICES) {
      expect(toNumber(row.weekdayMember)).toBeLessThan(toNumber(row.weekday));
      expect(toNumber(row.weekendMember)).toBeLessThan(toNumber(row.weekend));
    }
  });
});
