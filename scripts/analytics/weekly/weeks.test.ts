import { describe, expect, it } from "vitest";

import { addDays, gaDateToIso, instantToJstDate, jstDateOf, recentWeekStarts, weekStartOf } from "./weeks";

describe("週の計算(JST・月曜始まり)", () => {
  it("週頭は月曜日。日曜は前の月曜に入る", () => {
    expect(weekStartOf("2026-09-28")).toBe("2026-09-28"); // 月
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28"); // 日
    expect(weekStartOf("2026-10-05")).toBe("2026-10-05"); // 次の月
  });

  it("年またぎの週は前年の月曜から始まる", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("JST の日付は UTC の日曜 15:00 以降なら翌日(月曜)になる", () => {
    expect(jstDateOf(new Date("2026-10-04T14:59:59Z"))).toBe("2026-10-04");
    expect(jstDateOf(new Date("2026-10-04T15:00:00Z"))).toBe("2026-10-05");
  });

  it("直近の週頭を古い順に返す(今週を含む)", () => {
    expect(recentWeekStarts(new Date("2026-10-01T03:00:00Z"), 3)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("GA4 の YYYYMMDD を ISO に直し、形が違えば例外", () => {
    expect(gaDateToIso("20260929")).toBe("2026-09-29");
    expect(() => gaDateToIso("2026-09-29")).toThrow("GA4 の日付の形が想定と違います");
  });

  it("台帳の日時は JST の日付にそろえる(日付のみ・UTC・オフセット付き)", () => {
    expect(instantToJstDate("2026-09-29")).toBe("2026-09-29");
    expect(instantToJstDate("2026-09-28T16:30:00.000Z")).toBe("2026-09-29");
    expect(instantToJstDate("2026-09-29T00:30:00.000+09:00")).toBe("2026-09-29");
    expect(instantToJstDate("not a date")).toBeNull();
  });
});
