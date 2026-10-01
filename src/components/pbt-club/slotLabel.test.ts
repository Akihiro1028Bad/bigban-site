import { describe, it, expect } from "vitest";
import type { RateRow } from "@/lib/pbtClub/breakeven";
import { slotLabel, type SlotTranslator } from "./slotLabel";

const t: SlotTranslator = (key, values) =>
  values ? `${key}:${values.slot}` : key;

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
    expect(slotLabel(row(["6:00-9:00"], []), 3, t)).toBe("weekday:6:00-9:00");
  });

  it("土日祝が全時間帯なら「終日」にまとめる", () => {
    expect(
      slotLabel(row(["17:00-23:00"], ["6:00-9:00", "9:00-17:00", "17:00-23:00"]), 3, t),
    ).toBe("weekday:17:00-23:00 / weekendAllDay");
  });

  it("土日祝が一部の時間帯だけなら時間帯を並べる", () => {
    expect(slotLabel(row(["9:00-17:00"], ["9:00-17:00"]), 3, t)).toBe(
      "weekday:9:00-17:00 / weekend:9:00-17:00",
    );
  });
});
