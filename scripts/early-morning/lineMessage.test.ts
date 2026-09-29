// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildFlexMessage, selectLineEntries } from "./lineMessage";
import type { AttendanceRecord, Person } from "./types";

function record(personKey: string, ordinal: number | null, route: AttendanceRecord["route"] = "テニスベア", status: AttendanceRecord["status"] = "申込", date = "2026-10-06"): AttendanceRecord {
  return { key: `${date}_${personKey}`, date, personKey, route, appliedAt: null, status, sources: [], ordinal };
}

const people = new Map<string, Person>(
  ["A", "B", "C", "D", "E", "F"].map((k) => [k, { key: k, displayName: `テスト${k}`, tbId: null, lbName: null }]),
);

describe("selectLineEntries", () => {
  it("次回の申込だけを回数の多い順に並べ、初参加は最後", () => {
    const entries = selectLineEntries(
      { date: "2026-10-06", tbEventIds: [1], isCallOff: false, classType: "初中級" },
      [
        record("A", 3),
        record("B", 1),
        record("C", 15, "LaBOLA"),
        record("D", 3, "両方"),
        record("E", null, "テニスベア", "キャンセル"),
        record("F", 8, "テニスベア", "申込", "2026-09-29"),
        record("Z", 2),
      ],
      people,
    );
    expect(entries).toEqual([
      { displayName: "テストC", ordinal: 15, isLaBola: true },
      { displayName: "テストA", ordinal: 3, isLaBola: false },
      { displayName: "テストD", ordinal: 3, isLaBola: true },
      { displayName: "Z", ordinal: 2, isLaBola: false }, // 人が見つからなければ人キーを表示
      { displayName: "テストB", ordinal: 1, isLaBola: false },
    ]);
  });
});

describe("buildFlexMessage", () => {
  const base = { sessionDate: "2026-10-06", startTime: "06:00", updatedAt: "2026-10-05T20:31:00+09:00", notionUrl: "https://www.notion.so/abc" };

  it("見出し・人数・各行・フッターを作る", () => {
    const message = buildFlexMessage({
      ...base,
      entries: [
        { displayName: "テストC", ordinal: 15, isLaBola: true },
        { displayName: "テストB", ordinal: 1, isLaBola: false },
      ],
    });
    expect(message.type).toBe("flex");
    expect(message.altText).toBe("明日の早朝ピックル 10/6(火) 申込2名");
    const text = JSON.stringify(message.contents);
    expect(text).toContain("明日の早朝ピックル");
    expect(text).toContain("10/6(火) 6:00");
    expect(text).toContain("申込 2名");
    expect(text).toContain("テストC（LaBOLA）");
    expect(text).toContain("15回目");
    expect(text).toContain("初参加 🔰");
    expect(text).toContain("https://www.notion.so/abc?openExternalBrowser=1");
    expect(text).toContain("最終更新 10/5 20:31");
    expect(text).toContain("LaBOLA予約は本日朝8時時点までを反映");
    expect(text).not.toContain("🎁");
  });

  it("申込がなければその旨を1行出す", () => {
    const text = JSON.stringify(buildFlexMessage({ ...base, entries: [] }).contents);
    expect(text).toContain("申込 0名");
    expect(text).toContain("まだ申込はありません");
  });
});
