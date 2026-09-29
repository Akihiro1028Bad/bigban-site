// @vitest-environment node
import { describe, expect, it } from "vitest";

import { computeStats, findNextSession, milestonesUpTo, nextMilestone } from "./metrics";
import type { AttendanceRecord, Person, Session } from "./types";

const DATES = [
  "2026-08-04", "2026-08-11", "2026-08-18", "2026-08-25", "2026-09-01",
  "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06",
];
const sessions: Session[] = DATES.map((date, i) => ({ date, tbEventIds: [i], isCallOff: date === "2026-09-01" }));

function person(key: string): Person {
  return { key, displayName: key, tbId: null, lbName: null };
}

function attended(personKey: string, dates: string[], status: AttendanceRecord["status"] = "申込"): AttendanceRecord[] {
  return dates.map((date, i) => ({
    key: `${date}_${personKey}`,
    date,
    personKey,
    route: "テニスベア",
    appliedAt: null,
    status,
    sources: [],
    ordinal: status === "申込" ? i + 1 : null,
  }));
}

describe("milestones", () => {
  it("5・10・20・30・50、以降50ごと", () => {
    expect(milestonesUpTo(4)).toEqual([]);
    expect(milestonesUpTo(30)).toEqual([5, 10, 20, 30]);
    expect(milestonesUpTo(160)).toEqual([5, 10, 20, 30, 50, 100, 150]);
    expect(nextMilestone(0)).toBe(5);
    expect(nextMilestone(9)).toBe(10);
    expect(nextMilestone(50)).toBe(100);
  });
});

describe("findNextSession", () => {
  it("今日より後で中止でない最初の回", () => {
    expect(findNextSession(sessions, "2026-09-29")?.date).toBe("2026-10-06");
    expect(findNextSession(sessions, "2026-08-30")?.date).toBe("2026-09-08");
    expect(findNextSession(sessions, "2026-10-06")).toBeNull();
  });
});

describe("computeStats", () => {
  const today = "2026-09-29";

  it("常連: 直近8開催で4回以上、連続は最新回から数える", () => {
    const records = attended("tb:1", ["2026-08-25", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"]);
    const [stats] = computeStats({ people: [person("tb:1")], records, sessions, today });
    expect(stats).toMatchObject({
      total: 5,
      recent: 5,
      streak: 5, // 9/1 は中止回なので開催回に含めず、8/25 まで連続
      firstDate: "2026-08-25",
      lastDate: "2026-09-29",
      state: "常連",
      nextMilestone: "あと5回で10回",
      reachedMilestones: [5],
      isNextApplied: true,
    });
  });

  it("ご無沙汰: 累計3回以上で最終参加後4開催連続不参加(中止回は数えない)", () => {
    const records = attended("tb:2", ["2026-08-04", "2026-08-11", "2026-08-18"]);
    const [stats] = computeStats({ people: [person("tb:2")], records, sessions, today });
    expect(stats).toMatchObject({ total: 3, streak: 0, state: "ご無沙汰", isNextApplied: false });
  });

  it("新顔: 累計1〜2回。キャンセルと欠席(ordinal null)は数えない", () => {
    const records = [
      ...attended("tb:3", ["2026-09-22"]),
      ...attended("tb:3", ["2026-09-29"], "キャンセル"),
      { ...attended("tb:3", ["2026-09-15"])[0], ordinal: null },
    ];
    const [stats] = computeStats({ people: [person("tb:3")], records, sessions, today });
    expect(stats).toMatchObject({ total: 1, state: "新顔", lastDate: "2026-09-22" });
  });

  it("通常: どれにも当たらない。未参加の人は累計0で新顔", () => {
    const records = attended("tb:4", ["2026-08-04", "2026-08-11", "2026-09-29"]);
    const stats = computeStats({ people: [person("tb:5"), person("tb:4")], records, sessions, today });
    expect(stats.map((s) => [s.key, s.total, s.state, s.firstDate])).toEqual([
      ["tb:4", 3, "通常", "2026-08-04"],
      ["tb:5", 0, "新顔", null],
    ]);
  });

  it("次回の開催回がなければ次回申込は false", () => {
    const records = attended("tb:6", ["2026-10-06"]);
    const [stats] = computeStats({ people: [person("tb:6")], records, sessions, today: "2026-10-06" });
    expect(stats.isNextApplied).toBe(false);
  });

  it("累計が同数ならキーの昇順で並ぶ", () => {
    const stats = computeStats({ people: [person("tb:8"), person("tb:7")], records: [], sessions, today });
    expect(stats.map((s) => s.key)).toEqual(["tb:7", "tb:8"]);
  });
});
