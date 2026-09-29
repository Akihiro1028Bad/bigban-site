// @vitest-environment node
import { describe, expect, it } from "vitest";

import { classOfDate } from "./classes";
import { computeClassStats, isClassDormant, isClassRegular, isPerfect } from "./classStats";
import type { ClassStats } from "./classStats";
import type { AttendanceRecord, Session } from "./types";

function session(date: string, isCallOff = false): Session {
  return { date, tbEventIds: [], isCallOff, classType: classOfDate(date) };
}

function attend(personKey: string, dates: string[]): AttendanceRecord[] {
  return dates.map((date, i) => ({
    key: `${date}_${personKey}`,
    date,
    personKey,
    route: "テニスベア",
    appliedAt: null,
    status: "申込",
    sources: [],
    ordinal: i + 1,
  }));
}

const TUESDAYS = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"];
// 木曜は 8/27 が中止、9月は開催なし、10/1 再開
const THURSDAYS = ["2026-08-13", "2026-08-20", "2026-08-27", "2026-10-01"];
const sessions: Session[] = [...TUESDAYS.map((d) => session(d)), ...THURSDAYS.map((d) => session(d, d === "2026-08-27"))];

function stats(overrides: Partial<ClassStats>): ClassStats {
  return { attended: 0, heldSinceFirst: 0, streak: 0, recentAttended: 0, firstDate: null, lastDate: null, missedSinceLast: 0, ...overrides };
}

describe("computeClassStats", () => {
  it("皆勤: 初参加以降の同クラスの開催すべてに参加", () => {
    const records = attend("tb:1", ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"]);
    const result = computeClassStats({ personKey: "tb:1", records, sessions, classKey: "初中級", before: "2026-09-30" });
    expect(result).toEqual({
      attended: 4,
      heldSinceFirst: 4,
      streak: 4,
      recentAttended: 4,
      firstDate: "2026-09-08",
      lastDate: "2026-09-29",
      missedSinceLast: 0,
    });
    expect(isPerfect(result)).toBe(true);
  });

  it("初参加より前の開催は heldSinceFirst に入らない。連続は欠席で途切れる", () => {
    const records = attend("tb:1", ["2026-09-01", "2026-09-15", "2026-09-22", "2026-09-29"]);
    const result = computeClassStats({ personKey: "tb:1", records, sessions, classKey: "初中級", before: "2026-09-30" });
    expect(result).toMatchObject({ attended: 4, heldSinceFirst: 5, streak: 3, recentAttended: 3, missedSinceLast: 0 });
    expect(isPerfect(result)).toBe(false);
  });

  it("recentAttended は最新4回のうちの参加数", () => {
    const records = attend("tb:1", TUESDAYS.slice(0, 5));
    const result = computeClassStats({ personKey: "tb:1", records, sessions, classKey: "初中級", before: "2026-10-01" });
    expect(result).toMatchObject({ attended: 5, streak: 5, recentAttended: 4 });
  });

  it("休止期間(開催のない期間)をまたいでも missedSinceLast は増えない", () => {
    const records = attend("tb:2", ["2026-08-13", "2026-08-20"]);
    const result = computeClassStats({ personKey: "tb:2", records, sessions, classKey: "中級以上", before: "2026-09-30" });
    // 8/27 は中止、9月は木曜の開催なし
    expect(result).toMatchObject({ attended: 2, heldSinceFirst: 2, streak: 2, missedSinceLast: 0 });
    expect(isClassDormant({ ...result, attended: 3 })).toBe(false);
  });

  it("休止明けの開催回は不参加として数える", () => {
    const records = attend("tb:2", ["2026-08-13"]);
    const result = computeClassStats({ personKey: "tb:2", records, sessions, classKey: "中級以上", before: "2026-10-02" });
    expect(result).toMatchObject({ attended: 1, streak: 0, missedSinceLast: 2 });
  });

  it("火曜だけの人の木曜は参加0で、日付も連続も空", () => {
    const records = attend("tb:3", ["2026-09-08", "2026-09-15"]);
    const result = computeClassStats({ personKey: "tb:3", records, sessions, classKey: "中級以上", before: "2026-10-31" });
    expect(result).toEqual(stats({}));
  });

  it("中止回は開催数にも連続にも入れない", () => {
    const records = attend("tb:4", ["2026-08-20", "2026-08-27", "2026-10-01"]);
    const result = computeClassStats({ personKey: "tb:4", records, sessions, classKey: "中級以上", before: "2026-10-31" });
    expect(result).toMatchObject({ attended: 2, heldSinceFirst: 2, streak: 2, lastDate: "2026-10-01" });
  });

  it("before 当日は含まない(含めたければ翌日を渡す)", () => {
    const records = attend("tb:5", ["2026-09-22", "2026-09-29"]);
    const excluded = computeClassStats({ personKey: "tb:5", records, sessions, classKey: "初中級", before: "2026-09-29" });
    expect(excluded).toMatchObject({ attended: 1, lastDate: "2026-09-22", missedSinceLast: 0 });
    const included = computeClassStats({ personKey: "tb:5", records, sessions, classKey: "初中級", before: "2026-09-30" });
    expect(included).toMatchObject({ attended: 2, lastDate: "2026-09-29" });
  });

  it("他の人・ordinal なし(欠席やキャンセル)・そのクラスの開催でない日の記録は数えない", () => {
    const records = [
      ...attend("tb:6", ["2026-09-08"]),
      ...attend("tb:7", ["2026-09-15"]),
      { ...attend("tb:6", ["2026-09-22"])[0], ordinal: null },
      ...attend("tb:6", ["2026-09-24"]),
    ];
    const result = computeClassStats({ personKey: "tb:6", records, sessions, classKey: "初中級", before: "2026-09-30" });
    expect(result).toMatchObject({ attended: 1, lastDate: "2026-09-08", missedSinceLast: 3 });
  });

  it("開催回が日付順に並んでいなくても数えられる", () => {
    const shuffled = [session("2026-09-15"), session("2026-09-01"), session("2026-09-08")];
    const records = attend("tb:8", ["2026-09-01", "2026-09-08"]);
    const result = computeClassStats({ personKey: "tb:8", records, sessions: shuffled, classKey: "初中級", before: "2026-10-01" });
    expect(result).toMatchObject({ attended: 2, streak: 0, missedSinceLast: 1, firstDate: "2026-09-01", lastDate: "2026-09-08" });
  });
});

describe("isClassRegular", () => {
  it("直近4回で3回以上", () => {
    expect(isClassRegular(stats({ recentAttended: 3 }))).toBe(true);
    expect(isClassRegular(stats({ recentAttended: 2 }))).toBe(false);
  });
});

describe("isClassDormant", () => {
  it("参加3回以上かつ最終参加後に4回以上あき(境界)", () => {
    expect(isClassDormant(stats({ attended: 3, missedSinceLast: 4 }))).toBe(true);
    expect(isClassDormant(stats({ attended: 3, missedSinceLast: 3 }))).toBe(false);
    expect(isClassDormant(stats({ attended: 2, missedSinceLast: 4 }))).toBe(false);
  });
});

describe("isPerfect", () => {
  it("3回以上で、初参加以降のすべてに参加(境界)", () => {
    expect(isPerfect(stats({ attended: 3, heldSinceFirst: 3 }))).toBe(true);
    expect(isPerfect(stats({ attended: 2, heldSinceFirst: 2 }))).toBe(false);
    expect(isPerfect(stats({ attended: 3, heldSinceFirst: 4 }))).toBe(false);
  });
});
