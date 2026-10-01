import { describe, it, expect } from "vitest";
import { buildQuickDates, toJstDate } from "./quickDates";

// 2026-10-01 は木曜。10/3=土, 10/4=日。
const at = (iso: string) => new Date(iso);

describe("toJstDate", () => {
  it("UTC 15:00 を境に JST の日付が進む", () => {
    expect(toJstDate(at("2026-09-30T14:59:59Z"))).toEqual({
      year: 2026,
      month: 9,
      day: 30,
      weekday: 3,
    });
    expect(toJstDate(at("2026-09-30T15:00:00Z"))).toEqual({
      year: 2026,
      month: 10,
      day: 1,
      weekday: 4,
    });
  });
});

describe("buildQuickDates", () => {
  const ids = (now: Date) => buildQuickDates(now).map((d) => d.id);
  const md = (now: Date) =>
    buildQuickDates(now).map((d) => `${d.month}/${d.day}`);

  it("木曜: 今日・明日・土・日", () => {
    const now = at("2026-10-01T03:00:00Z");
    expect(ids(now)).toEqual(["today", "tomorrow", "saturday", "sunday"]);
    expect(md(now)).toEqual(["10/1", "10/2", "10/3", "10/4"]);
  });

  it("金曜: 明日が土曜なので重複せず 今日・明日・日", () => {
    const now = at("2026-10-02T03:00:00Z");
    expect(ids(now)).toEqual(["today", "tomorrow", "sunday"]);
    expect(md(now)).toEqual(["10/2", "10/3", "10/4"]);
  });

  it("土曜: 今日が土曜・明日が日曜なので 今日・明日 のみ", () => {
    const now = at("2026-10-03T03:00:00Z");
    expect(ids(now)).toEqual(["today", "tomorrow"]);
    expect(md(now)).toEqual(["10/3", "10/4"]);
  });

  it("日曜: 今日・明日・次の土曜", () => {
    const now = at("2026-10-04T03:00:00Z");
    expect(ids(now)).toEqual(["today", "tomorrow", "saturday"]);
    expect(md(now)).toEqual(["10/4", "10/5", "10/10"]);
  });

  it.each([
    ["月", "2026-10-05T03:00:00Z"],
    ["火", "2026-10-06T03:00:00Z"],
    ["水", "2026-10-07T03:00:00Z"],
  ])("%s曜: 4件が日付の昇順で並ぶ", (_label, iso) => {
    const dates = buildQuickDates(at(iso));
    expect(dates).toHaveLength(4);
    const keys = dates.map((d) => d.year * 10000 + d.month * 100 + d.day);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
  });

  it("月またぎ・年またぎでも正しい日付を返す", () => {
    expect(md(at("2026-10-31T03:00:00Z"))).toEqual(["10/31", "11/1"]);
    const nye = buildQuickDates(at("2026-12-31T03:00:00Z"));
    expect(nye.map((d) => `${d.year}-${d.month}-${d.day}`)).toEqual([
      "2026-12-31",
      "2027-1-1",
      "2027-1-2",
      "2027-1-3",
    ]);
  });

  it("UTC では前日でも JST の今日を基準にする", () => {
    expect(md(at("2026-09-30T16:00:00Z"))[0]).toBe("10/1");
  });
});
