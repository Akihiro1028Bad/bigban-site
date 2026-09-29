// @vitest-environment node
import { describe, expect, it } from "vitest";

import { classOfDate } from "./classes";
import { computeStats, findNextSession, milestonesUpTo, nextMilestone } from "./metrics";
import type { AttendanceRecord, Person, Session } from "./types";

const DATES = [
  "2026-08-04", "2026-08-11", "2026-08-18", "2026-08-25", "2026-09-01",
  "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06",
];
const sessions: Session[] = DATES.map((date, i) => ({ date, tbEventIds: [i], isCallOff: date === "2026-09-01", classType: "初中級" }));

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

  it("常連: クラスの直近4回で3回以上、連続は最新回から数える", () => {
    const records = attended("tb:1", ["2026-08-25", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"]);
    const [stats] = computeStats({ people: [person("tb:1")], records, sessions, today });
    expect(stats).toMatchObject({
      total: 5,
      classCounts: { 初中級: 5, 中級以上: 0 },
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

describe("computeStats クラス別の状態(火=初中級・木=中級以上)", () => {
  const today = "2026-09-29";
  const TUESDAYS = [
    "2026-08-04", "2026-08-11", "2026-08-18", "2026-08-25",
    "2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29",
  ];
  // 木曜は 8/27 が中止、9月は開催なし
  const THURSDAYS = [
    "2026-07-02", "2026-07-09", "2026-07-16", "2026-07-23", "2026-07-30",
    "2026-08-06", "2026-08-13", "2026-08-20", "2026-08-27",
  ];
  const OTHERS = ["2026-09-02", "2026-09-09", "2026-09-16"];
  const calendar: Session[] = [...TUESDAYS, ...THURSDAYS, ...OTHERS].map((date, i) => ({
    date,
    tbEventIds: [i],
    isCallOff: date === "2026-08-27",
    classType: classOfDate(date),
  }));

  function stateOf(records: AttendanceRecord[]) {
    const [result] = computeStats({ people: [person("tb:1")], records, sessions: calendar, today });
    return result;
  }

  it("火曜だけ皆勤の人は常連(全体の直近8回では4回しか数えられない例)", () => {
    const result = stateOf(attended("tb:1", ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"]));
    expect(result).toMatchObject({ total: 5, state: "常連", classCounts: { 初中級: 5, 中級以上: 0 } });
  });

  it("木曜が休止中の木曜常連は、休止中の欠席を数えられずご無沙汰にならない", () => {
    const result = stateOf(attended("tb:1", ["2026-08-06", "2026-08-13", "2026-08-20"]));
    expect(result).toMatchObject({ total: 3, state: "常連", classCounts: { 初中級: 0, 中級以上: 3 } });
  });

  it("火曜ご無沙汰・木曜常連なら常連", () => {
    const result = stateOf(attended("tb:1", ["2026-08-04", "2026-08-11", "2026-08-18", "2026-08-06", "2026-08-13", "2026-08-20"]));
    expect(result).toMatchObject({ total: 6, state: "常連", classCounts: { 初中級: 3, 中級以上: 3 } });
  });

  it("参加しているクラスがすべてご無沙汰ならご無沙汰", () => {
    const result = stateOf(attended("tb:1", ["2026-08-04", "2026-08-11", "2026-08-18", "2026-07-02", "2026-07-09", "2026-07-16"]));
    expect(result).toMatchObject({ total: 6, state: "ご無沙汰", classCounts: { 初中級: 3, 中級以上: 3 } });
  });

  it("片方のクラスだけご無沙汰でもう片方が常連でも通常でもなければ通常", () => {
    const result = stateOf(attended("tb:1", ["2026-08-04", "2026-08-11", "2026-08-18", "2026-08-20"]));
    expect(result).toMatchObject({ total: 4, state: "通常", classCounts: { 初中級: 3, 中級以上: 1 } });
  });

  it("その他の回だけの人は、1〜2回なら新顔、3回以上なら通常(クラス別の判定に使わない)", () => {
    const [few, many] = ["tb:1", "tb:2"].map((key) =>
      computeStats({
        people: [person(key)],
        records: attended(key, key === "tb:1" ? ["2026-09-02"] : OTHERS),
        sessions: calendar,
        today,
      })[0],
    );
    expect(few).toMatchObject({ total: 1, state: "新顔", classCounts: { 初中級: 0, 中級以上: 0 } });
    expect(many).toMatchObject({ total: 3, state: "通常", classCounts: { 初中級: 0, 中級以上: 0 } });
  });

  it("今日の回はクラスの値に含め、翌日以降は含めない", () => {
    const result = stateOf(attended("tb:1", ["2026-09-29", "2026-10-06"]));
    expect(result.classCounts).toEqual({ 初中級: 1, 中級以上: 0 });
  });
});
