// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildFlexMessage, selectEntries } from "./lineMessage";
import type { ClassRecord, Session } from "./types";

const session: Session = {
  key: "2026-10-07_19:00",
  date: "2026-10-07",
  startTime: "19:00",
  classType: "ビギナー",
  eventName: "HYROX TRAINING @ DAISUKE CLASS ビギナーの部",
};

function rec(personKey: string, ordinal: number | null, overrides: Partial<ClassRecord> = {}): ClassRecord {
  return {
    key: `${session.key}_${personKey}`,
    sessionKey: session.key,
    date: session.date,
    startTime: session.startTime,
    classType: session.classType,
    personKey,
    reservationNos: ["#1"],
    status: "申込",
    ordinal,
    ...overrides,
  };
}

describe("selectEntries", () => {
  it("この回の参加だけを、回数の多い順・同数は名前順・初参加は最後に並べ、所見を添える", () => {
    const records = [
      rec("lb:A", 1),
      rec("lb:B", 5),
      rec("lb:C", 2),
      rec("lb:D", null, { status: "キャンセル" }),
      rec("lb:E", 3, { sessionKey: "2026-10-07_20:00" }),
      rec("lb:G", 4),
      rec("lb:F", 4),
    ];
    const people = new Map(
      ["A", "B", "F", "G"].map((suffix) => [`lb:${suffix}`, { key: `lb:${suffix}`, displayName: `架空${suffix}` }]),
    );
    const notes = new Map([[`${session.key}_lb:A`, ["初めての方。声かけをお願いします", "施設の利用も初めて"]]]);

    expect(selectEntries(session, records, people, notes)).toEqual([
      { displayName: "架空B", ordinal: 5, notes: [] },
      { displayName: "架空F", ordinal: 4, notes: [] },
      { displayName: "架空G", ordinal: 4, notes: [] },
      { displayName: "lb:C", ordinal: 2, notes: [] },
      { displayName: "架空A", ordinal: 1, notes: ["初めての方。声かけをお願いします", "施設の利用も初めて"] },
    ]);
  });
});

describe("selectEntries の初参加の並び", () => {
  it("初参加は入力の順に関わらず最後に置き、初参加どうしは名前順にする", () => {
    const people = new Map(
      ["A", "B", "C"].map((suffix) => [`lb:${suffix}`, { key: `lb:${suffix}`, displayName: `架空${suffix}` }]),
    );
    const forward = selectEntries(session, [rec("lb:B", 1), rec("lb:C", 1), rec("lb:A", 3)], people, new Map());
    const backward = selectEntries(session, [rec("lb:A", 3), rec("lb:C", 1), rec("lb:B", 1)], people, new Map());

    const expected = ["架空A", "架空B", "架空C"];
    expect(forward.map((entry) => entry.displayName)).toEqual(expected);
    expect(backward.map((entry) => entry.displayName)).toEqual(expected);
  });
});

describe("buildFlexMessage", () => {
  it("回ごとに見出し・人数・参加者・所見を並べ、フッターに Notion と最終更新を置く", () => {
    const flex = buildFlexMessage({
      date: "2026-10-07",
      sessions: [
        {
          session,
          entries: [
            { displayName: "架空B", ordinal: 5, notes: [] },
            { displayName: "架空A", ordinal: 1, notes: ["初めての方。声かけをお願いします", "施設の利用も初めて"] },
          ],
        },
        {
          session: { ...session, key: "2026-10-07_20:00", startTime: "20:00", classType: "通常" },
          entries: [{ displayName: "架空C", ordinal: 12, notes: ["通常回は初めて(ビギナー3回)"] }],
        },
      ],
      updatedAt: "2026-10-07T08:31:00+09:00",
      notionUrl: "https://www.notion.so/people",
    });

    expect(flex.type).toBe("flex");
    expect(flex.altText).toBe("本日のDAISUKE CLASS 10/7(水) 19:00 ビギナーの部 2名・20:00 通常 1名");
    const body = flex.contents.body as { contents: Record<string, unknown>[] };
    expect(body.contents.map((item) => item.text ?? item.type)).toEqual([
      "19:00 ビギナーの部  2名",
      "separator",
      "box",
      "box",
      "初めての方。声かけをお願いします",
      "施設の利用も初めて",
      "20:00 通常  1名",
      "separator",
      "box",
      "通常回は初めて(ビギナー3回)",
    ]);
    const json = JSON.stringify(flex);
    expect(json).toContain("初参加 🔰");
    expect(json).toContain("5回目");
    expect(json).toContain("本日の DAISUKE CLASS");
    expect(json).toContain("https://www.notion.so/people?openExternalBrowser=1");
    expect(json).toContain("最終更新 10/7 08:31");
    expect(json).toContain("予約は本日朝8時時点までを反映");
  });
});
