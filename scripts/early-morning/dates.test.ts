// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  formatMonthDayTime,
  formatMonthDayWeekday,
  formatStartTime,
  isoDatePart,
  isoTimePart,
  jstDate,
  jstDateTime,
} from "./dates";

describe("dates", () => {
  it("UTC の夜は JST の翌日になる", () => {
    const now = new Date("2026-10-05T15:30:00Z");
    expect(jstDate(now)).toBe("2026-10-06");
    expect(jstDateTime(now)).toBe("2026-10-06T00:30:00+09:00");
  });

  it("ISO 文字列から日付と時刻を取り出す", () => {
    expect(isoDatePart("2026-08-25T06:00:00.000+09:00")).toBe("2026-08-25");
    expect(isoTimePart("2026-08-25T06:00:00.000+09:00")).toBe("06:00");
  });

  it("月日と曜日を表示用に整える", () => {
    expect(formatMonthDayWeekday("2026-10-06")).toBe("10/6(火)");
    expect(formatMonthDayWeekday("2026-10-04")).toBe("10/4(日)");
  });

  it("更新日時を M/D HH:MM に整える", () => {
    expect(formatMonthDayTime("2026-10-05T20:31:00+09:00")).toBe("10/5 20:31");
  });

  it("開始時刻の先頭ゼロを外す", () => {
    expect(formatStartTime("06:00")).toBe("6:00");
    expect(formatStartTime("19:00")).toBe("19:00");
  });
});
