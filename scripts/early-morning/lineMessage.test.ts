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
      new Map([
        ["A", "火曜 8回中5回"],
        ["B", "初めての方。声かけをお願いします"],
      ]),
    );
    expect(entries).toEqual([
      { displayName: "テストC", ordinal: 15, isLaBola: true, note: "" },
      { displayName: "テストA", ordinal: 3, isLaBola: false, note: "火曜 8回中5回" },
      { displayName: "テストD", ordinal: 3, isLaBola: true, note: "" },
      { displayName: "Z", ordinal: 2, isLaBola: false, note: "" }, // 人が見つからなければ人キーを表示
      { displayName: "テストB", ordinal: 1, isLaBola: false, note: "初めての方。声かけをお願いします" },
    ]);
  });
});

describe("buildFlexMessage", () => {
  const base = { sessionDate: "2026-10-06", startTime: "06:00", classLabel: null, updatedAt: "2026-10-05T20:31:00+09:00", notionUrl: "https://www.notion.so/abc" };

  it("見出し・人数・各行・フッターを作る", () => {
    const message = buildFlexMessage({
      ...base,
      entries: [
        { displayName: "テストC", ordinal: 15, isLaBola: true, note: "" },
        { displayName: "テストB", ordinal: 1, isLaBola: false, note: "" },
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

  it("所見があれば各行の下に灰色の小さい文字で出し、空なら出さない", () => {
    const message = buildFlexMessage({
      ...base,
      entries: [
        { displayName: "テストC", ordinal: 15, isLaBola: false, note: "火曜 皆勤（8/4から8回連続）" },
        { displayName: "テストB", ordinal: 4, isLaBola: false, note: "" },
      ],
    });
    const body = (message.contents as { body: { contents: Array<Record<string, unknown>> } }).body.contents;
    const noteLine = { type: "text", text: "火曜 皆勤（8/4から8回連続）", size: "xs", color: "#8A8A8A", wrap: true, margin: "none" };
    // 見出し・区切り線のあと、行(C)・所見(C)・行(B)の3つだけ
    expect(body).toHaveLength(5);
    expect(body[3]).toEqual(noteLine);
    expect(JSON.stringify(body[4])).toContain("テストB");
  });

  it("クラスがあれば見出しの2行目に付け、null なら付けない", () => {
    const heading = (classLabel: string | null) => {
      const message = buildFlexMessage({ ...base, classLabel, entries: [] });
      return (message.contents as { header: { contents: Array<{ text: string }> } }).header.contents[1].text;
    };
    expect(heading("初中級")).toBe("10/6(火) 6:00 初中級");
    expect(heading(null)).toBe("10/6(火) 6:00");
  });

  it("申込がなければその旨を1行出す", () => {
    const text = JSON.stringify(buildFlexMessage({ ...base, entries: [] }).contents);
    expect(text).toContain("申込 0名");
    expect(text).toContain("まだ申込はありません");
  });
});
