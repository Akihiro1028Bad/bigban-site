import { describe, it, expect } from "vitest";
import type { RateRow } from "@/lib/pbtClub/breakeven";
import { slotLabel, type SlotTranslator } from "./slotLabel";

const t: SlotTranslator = (key, values) => `${key}:${values.slot}`;

function row(weekdaySlots: string[], weekendSlots: string[]): RateRow {
  return {
    normalYen: 7980,
    memberYen: 5600,
    savingPerHourYen: 2380,
    exactBreakEvenHours: 4.2,
    breakEvenHours: 5,
    weekdaySlots,
    weekendSlots,
  };
}

describe("slotLabel", () => {
  it("平日だけの行は平日の時間帯を並べる", () => {
    expect(slotLabel(row(["6:00-9:00"], []), t)).toBe("weekday:6:00-9:00");
  });

  it("連続する土日祝の時間帯は1つの範囲にまとめる", () => {
    expect(
      slotLabel(
        row(["17:00-23:00"], ["6:00-9:00", "9:00-17:00", "17:00-23:00"]),
        t,
      ),
    ).toBe("weekday:17:00-23:00 / weekend:6:00-23:00");
  });

  it("平日と土日祝で別の時間帯なら両方を並べる", () => {
    expect(slotLabel(row(["9:00-17:00"], ["23:00-25:00"]), t)).toBe(
      "weekday:9:00-17:00 / weekend:23:00-25:00",
    );
  });
});
