import { describe, it, expect } from "vitest";
import { COURT_PRICES } from "@/constants/pricing";
import {
  BOOKING_WINDOW_DAYS,
  FIRST_VISIT_PATH,
  PARTY_SIZE_EXAMPLE,
  businessHoursValues,
  formatYen,
  parseYen,
  perPersonRows,
  perPersonYen,
} from "./firstVisit";

describe("firstVisit 定数", () => {
  it("パスと受付開始日(公開済みニュースの値)を持つ", () => {
    expect(FIRST_VISIT_PATH).toBe("/first-visit");
    expect(BOOKING_WINDOW_DAYS).toEqual({ general: 14, member: 30 });
    expect(PARTY_SIZE_EXAMPLE).toBe(4);
  });
});

describe("parseYen", () => {
  it("料金表の表記を数値にする", () => {
    expect(parseYen("¥4,980")).toBe(4980);
  });
  it("数字が無い文字列は例外にする", () => {
    expect(() => parseYen("無料")).toThrow("金額を読み取れません");
  });
});

describe("perPersonYen", () => {
  it.each([
    [4980, 1250],
    [5980, 1500],
    [7980, 2000],
  ])("4人で割った %i 円は10円単位に丸めて %i 円", (price, expected) => {
    expect(perPersonYen(price, 4)).toBe(expected);
  });
  it.each([0, -1, 1.5])("人数 %s は例外にする", (size) => {
    expect(() => perPersonYen(4980, size)).toThrow(RangeError);
  });
});

describe("formatYen", () => {
  it("¥とカンマ区切りで表す", () => {
    expect(formatYen(1250)).toBe("¥1,250");
  });
});

describe("businessHoursValues", () => {
  it("日本語は 25:00 表記、それ以外は12時間表記(営業時間の定数が単一ソース)", () => {
    expect(businessHoursValues("ja")).toEqual({ open: "6:00", close: "25:00" });
    expect(businessHoursValues("en")).toEqual({
      open: "6:00 AM",
      close: "1:00 AM",
    });
  });
});

describe("perPersonRows", () => {
  it("COURT_PRICES の全行を既定4人で割った表を返す", () => {
    const rows = perPersonRows();
    expect(rows.map((r) => r.timeSlot)).toEqual(
      COURT_PRICES.map((r) => r.timeSlot),
    );
    expect(rows[0]).toEqual({
      timeSlot: "6:00-9:00",
      weekday: "¥1,250",
      weekend: "¥2,000",
    });
  });
  it("深夜帯(23:00-25:00)も同じ料金表から4人で割る", () => {
    const night = perPersonRows().find((r) => r.timeSlot === "23:00-25:00");
    expect(night).toEqual({
      timeSlot: "23:00-25:00",
      weekday: "¥1,000",
      weekend: "¥1,500",
    });
  });
  it("人数を指定できる", () => {
    expect(perPersonRows(2)[0].weekday).toBe("¥2,490");
  });
});
