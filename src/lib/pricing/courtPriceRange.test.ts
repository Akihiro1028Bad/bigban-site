import { describe, it, expect } from "vitest";
import type { CourtPriceRow } from "@/constants/pricing";
import { COURT_PRICES } from "@/constants/pricing";
import { courtPriceRange } from "./courtPriceRange";

const row = (weekday: string, weekend: string): CourtPriceRow => ({
  timeSlot: "x",
  weekday,
  weekend,
  weekdayMember: "¥1",
  weekendMember: "¥1",
});

describe("courtPriceRange", () => {
  it("平日・週末の非会員料金の最小と最大を元の表記で返す", () => {
    expect(
      courtPriceRange([row("¥4,980", "¥7,980"), row("¥3,980", "¥5,980")]),
    ).toEqual({ min: "¥3,980", max: "¥7,980" });
  });

  it("会員料金は対象にしない", () => {
    expect(courtPriceRange([row("¥5,000", "¥6,000")])).toEqual({
      min: "¥5,000",
      max: "¥6,000",
    });
  });

  it("既定では COURT_PRICES から求める", () => {
    const amounts = COURT_PRICES.flatMap((r) => [r.weekday, r.weekend]).map(
      (p) => Number(p.replace(/[^0-9]/g, "")),
    );
    const { min, max } = courtPriceRange();
    expect(Number(min.replace(/[^0-9]/g, ""))).toBe(Math.min(...amounts));
    expect(Number(max.replace(/[^0-9]/g, ""))).toBe(Math.max(...amounts));
  });

  it("行が空なら例外を投げる", () => {
    expect(() => courtPriceRange([])).toThrow();
  });
});
