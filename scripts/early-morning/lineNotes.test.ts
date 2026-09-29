// @vitest-environment node
import { describe, expect, it } from "vitest";

import { addDays } from "./dates";
import { classOfDate } from "./classes";
import { buildLineNotes } from "./lineNotes";
import type { AttendanceRecord, Session } from "./types";

function dateRange(from: string, to: string, weekday: number): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === weekday) dates.push(date);
  }
  return dates;
}

// 火曜は 6/2〜10/13、木曜は 6/4〜8/27(8/27 は中止)と 10/1 以降(9 月は休止)
const TUESDAYS = dateRange("2026-06-02", "2026-10-13", 2);
const THURSDAYS = [...dateRange("2026-06-04", "2026-08-27", 4), "2026-10-01", "2026-10-08"];
const OTHER_DAY = "2026-06-24";
const sessions: Session[] = [...TUESDAYS, ...THURSDAYS, OTHER_DAY].map((date) => ({
  date,
  tbEventIds: [],
  isCallOff: date === "2026-08-27",
  classType: classOfDate(date),
}));

/** 日付順に ordinal を振った申込の出欠記録。 */
function attend(personKey: string, dates: readonly string[]): AttendanceRecord[] {
  return [...dates].sort().map((date, index) => ({
    key: `${date}_${personKey}`,
    date,
    personKey,
    route: "テニスベア",
    appliedAt: null,
    status: "申込",
    sources: [],
    ordinal: index + 1,
  }));
}

function sessionOn(date: string): Session {
  const found = sessions.find((session) => session.date === date);
  if (!found) throw new Error(`no session ${date}`);
  return found;
}

function noteFor(personKey: string, date: string, records: readonly AttendanceRecord[]): string | undefined {
  return buildLineNotes({ session: sessionOn(date), records, sessions }).get(personKey);
}

const without = (dates: readonly string[], skip: readonly string[]) => dates.filter((date) => !skip.includes(date));
const tuesdaysBetween = (from: string, to: string) => TUESDAYS.filter((date) => date >= from && date <= to);
const heldThursdays = THURSDAYS.filter((date) => date !== "2026-08-27");

describe("buildLineNotes", () => {
  it("全体の1回目は声かけの案内だけ", () => {
    expect(noteFor("A", "2026-09-29", attend("A", ["2026-09-29"]))).toBe("初めての方。声かけをお願いします");
  });

  it("全体の2回目は初参加日を添える", () => {
    expect(noteFor("A", "2026-09-29", attend("A", ["2026-09-22", "2026-09-29"]))).toBe("2回目（前回 9/22 が初参加）");
  });

  it("その回のクラスで皆勤なら初参加日と連続回数を出し、連続の一言は足さない", () => {
    const dates = [...tuesdaysBetween("2026-08-04", "2026-09-22"), "2026-09-29"];
    expect(noteFor("A", "2026-09-29", attend("A", dates))).toBe("火曜 皆勤（8/4から8回連続）");
  });

  it("休止前の連続が3回以上ならクラスの回数に連続を足す", () => {
    const dates = [...without(heldThursdays.slice(0, 12), ["2026-07-02"]), "2026-10-01"];
    expect(noteFor("A", "2026-10-01", attend("A", dates))).toBe("木曜 12回中11回・7回連続");
  });

  it("最終参加から28日以上あいたら前回の日付を足す", () => {
    const dates = ["2026-06-11", "2026-06-25", "2026-07-09", "2026-07-23", "2026-08-06", "2026-08-20", "2026-10-01"];
    expect(noteFor("A", "2026-10-01", attend("A", dates))).toBe("木曜 11回中6回・前回 8/20");
  });

  it("最終参加から28日未満なら前回は足さない", () => {
    const dates = ["2026-08-04", "2026-08-25", "2026-09-08", "2026-09-29"];
    expect(noteFor("A", "2026-09-29", attend("A", dates))).toBe("火曜 8回中3回");
  });

  it("もう一方のクラスの常連なら曜日を添える", () => {
    const tuesdays = ["2026-07-21", "2026-07-28", "2026-08-04", "2026-08-18", "2026-09-01", "2026-09-08", "2026-09-15", "2026-09-29"];
    const thursdays = ["2026-08-06", "2026-08-13", "2026-08-20"];
    expect(noteFor("A", "2026-10-06", attend("A", [...tuesdays, ...thursdays, "2026-10-06"]))).toBe("火曜 11回中8回・木曜も常連");
  });

  it("皆勤でももう一方のクラスの常連なら曜日を添える", () => {
    const tuesdays = tuesdaysBetween("2026-08-04", "2026-09-29");
    const thursdays = ["2026-08-06", "2026-08-13", "2026-08-20"];
    expect(noteFor("A", "2026-10-06", attend("A", [...tuesdays, ...thursdays, "2026-10-06"]))).toBe("火曜 皆勤（8/4から9回連続）・木曜も常連");
  });

  it("そのクラスに初めて来る人は初参加と、もう一方の常連を出す", () => {
    const thursdays = ["2026-08-06", "2026-08-13", "2026-08-20"];
    expect(noteFor("A", "2026-10-06", attend("A", [...thursdays, "2026-10-06"]))).toBe("火曜は初参加・木曜も常連");
  });

  it("そのクラスに初めて来る人でもう一方の常連でなければ初参加だけ", () => {
    const thursdays = ["2026-06-04", "2026-06-25", "2026-07-16"];
    expect(noteFor("A", "2026-10-06", attend("A", [...thursdays, "2026-10-06"]))).toBe("火曜は初参加");
  });

  it("クラスご無沙汰なら久しぶりと最後に来た日を出し、前回は足さない", () => {
    const dates = ["2026-08-04", "2026-08-11", "2026-08-18", "2026-09-22"];
    expect(noteFor("A", "2026-09-22", attend("A", dates))).toBe("久しぶり（火曜は8/18以来）");
  });

  it("その他の回は所見を付けない", () => {
    const dates = ["2026-06-02", "2026-06-09", "2026-06-16", OTHER_DAY];
    expect(noteFor("A", OTHER_DAY, attend("A", dates))).toBe("");
  });

  it("その回の申込だけを人キーごとに返す(キャンセル・他の日・ordinalなしは除く)", () => {
    const cancelled: AttendanceRecord = { ...attend("C", ["2026-09-29"])[0], status: "キャンセル", ordinal: null };
    const records = [...attend("A", ["2026-09-29"]), ...attend("B", ["2026-09-22"]), cancelled];
    const notes = buildLineNotes({ session: sessionOn("2026-09-29"), records, sessions });
    expect([...notes.keys()]).toEqual(["A"]);
  });
});
