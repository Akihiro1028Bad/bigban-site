// @vitest-environment node
import { describe, expect, it } from "vitest";

import { computeStats, countByClass, isParticipation, mondayOf, stateOf, weekStreak } from "./metrics";
import type { ClassRecord } from "./types";

function rec(date: string, overrides: Partial<ClassRecord> = {}): ClassRecord {
  const sessionKey = `${date}_20:00`;
  return {
    key: `${sessionKey}_lb:架空一郎`,
    sessionKey,
    date,
    startTime: "20:00",
    classType: "通常",
    personKey: "lb:架空一郎",
    reservationNos: ["#1"],
    status: "申込",
    ordinal: 1,
    ...overrides,
  };
}

const today = "2026-10-07";

describe("isParticipation", () => {
  it("申込で回次があるものだけを参加とみなす", () => {
    expect(isParticipation(rec(today))).toBe(true);
    expect(isParticipation(rec(today, { ordinal: null }))).toBe(false);
    expect(isParticipation(rec(today, { status: "キャンセル", ordinal: null }))).toBe(false);
  });
});

describe("stateOf", () => {
  it("通算3回以上で最終参加から28日以上ならご無沙汰", () => {
    expect(stateOf([rec("2026-08-01"), rec("2026-08-05"), rec("2026-09-09")], today)).toBe("ご無沙汰");
  });

  it("最終参加から27日ならご無沙汰にせず、直近28日の回数で判定する", () => {
    expect(stateOf([rec("2026-08-01"), rec("2026-08-05"), rec("2026-09-10")], today)).toBe("通常");
  });

  it("直近28日に3回以上で常連", () => {
    expect(stateOf([rec("2026-09-10"), rec("2026-09-20"), rec(today)], today)).toBe("常連");
  });

  it("28日前の参加は直近28日に数えない(28日前・20日前・今日の3回は常連にならない)", () => {
    expect(stateOf([rec("2026-09-09"), rec("2026-09-17"), rec(today)], today)).toBe("通常");
  });

  it("通算2回以下は新顔(0回も新顔)", () => {
    expect(stateOf([rec("2026-10-01")], today)).toBe("新顔");
    expect(stateOf([], today)).toBe("新顔");
  });
});

describe("mondayOf", () => {
  it.each([
    ["2026-10-07", "2026-10-05"],
    ["2026-10-05", "2026-10-05"],
    ["2026-10-04", "2026-09-28"],
  ])("%s の週の月曜は %s", (date, monday) => {
    expect(mondayOf(date)).toBe(monday);
  });
});

describe("weekStreak", () => {
  it("今週を含めず、先週から遡って参加のある週が続いた数", () => {
    expect(weekStreak(["2026-09-09", "2026-09-25", "2026-09-30"], today)).toBe(2);
  });

  it("先週に参加がなければ 0(今週の参加は数えない)", () => {
    expect(weekStreak(["2026-10-05", "2026-09-23"], today)).toBe(0);
  });
});

describe("countByClass", () => {
  it("クラスごとに数える", () => {
    expect(countByClass([rec(today, { classType: "ビギナー" }), rec(today), rec(today)])).toEqual({ ビギナー: 1, 通常: 2, ダブルス: 0 });
  });
});

describe("computeStats", () => {
  it("今日までの参加で集計し、今日以降の申込で次回申込にし、利用歴を添える", () => {
    const people = [
      { key: "lb:架空一郎", displayName: "架空一郎" },
      { key: "lb:架空二郎", displayName: "架空二郎" },
    ];
    const records = [
      rec("2026-09-23", { classType: "ビギナー", ordinal: 1 }),
      rec("2026-09-30", { ordinal: 2 }),
      rec("2026-10-02", { status: "キャンセル", ordinal: null }),
      rec("2026-10-09", { ordinal: 3 }),
      rec("2026-09-30", { key: "2026-09-30_20:00_lb:架空二郎", personKey: "lb:架空二郎", status: "キャンセル", ordinal: null }),
    ];

    const stats = computeStats({ people, records, today, historyByPerson: new Map([["lb:架空一郎", "体験会(9/22)"]]) });

    expect(stats).toEqual([
      {
        key: "lb:架空一郎",
        displayName: "架空一郎",
        total: 2,
        classCounts: { ビギナー: 1, 通常: 1, ダブルス: 0 },
        firstDate: "2026-09-23",
        lastDate: "2026-09-30",
        state: "新顔",
        isNextApplied: true,
        history: "体験会(9/22)",
      },
      {
        key: "lb:架空二郎",
        displayName: "架空二郎",
        total: 0,
        classCounts: { ビギナー: 0, 通常: 0, ダブルス: 0 },
        firstDate: null,
        lastDate: null,
        state: "新顔",
        isNextApplied: false,
        history: "",
      },
    ]);
  });
});
