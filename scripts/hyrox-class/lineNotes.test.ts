// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildNotes, noteFor } from "./lineNotes";
import type { ClassRecord, LedgerRow } from "./types";

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

describe("noteFor", () => {
  it("1. 初参加は声かけと利用歴の2行", () => {
    expect(noteFor({ classType: "ビギナー", prior: [], today, history: "体験会(9/22)" })).toEqual([
      "初めての方。声かけをお願いします",
      "これまで: 体験会(9/22)",
    ]);
  });

  it("1. 利用歴がなければ施設の利用も初めて", () => {
    expect(noteFor({ classType: "ビギナー", prior: [], today, history: "" })).toEqual([
      "初めての方。声かけをお願いします",
      "施設の利用も初めて",
    ]);
  });

  it("2. 今日のクラスに初めてなら、前にいたクラスの回数を添える", () => {
    const prior = [rec("2026-09-16", { classType: "ビギナー" }), rec("2026-09-23", { classType: "ビギナー" }), rec("2026-09-25", { classType: "ダブルス" })];
    expect(noteFor({ classType: "通常", prior, today, history: "" })).toEqual(["通常回は初めて(ビギナー2回)"]);
  });

  it("2. 前にいたクラスが同数なら、クラスの並び順で先のもの", () => {
    const prior = [rec("2026-09-25", { classType: "ダブルス" }), rec("2026-09-23", { classType: "ビギナー" })];
    expect(noteFor({ classType: "通常", prior, today, history: "" })).toEqual(["通常回は初めて(ビギナー1回)"]);
  });

  it("2. 並び順で後のクラスのほうが回数が多ければ、そちらを添える", () => {
    const prior = [rec("2026-09-23", { classType: "ダブルス" }), rec("2026-09-25", { classType: "ダブルス" })];
    expect(noteFor({ classType: "ビギナー", prior, today, history: "" })).toEqual(["ビギナーは初めて(ダブルス2回)"]);
  });

  it("3. 通算2回目", () => {
    expect(noteFor({ classType: "通常", prior: [rec("2026-09-30")], today, history: "" })).toEqual(["2回目(初参加 9/30)"]);
  });

  it("4. 最終参加から28日以上なら久しぶり", () => {
    expect(noteFor({ classType: "通常", prior: [rec("2026-08-19"), rec("2026-09-09")], today, history: "" })).toEqual(["久しぶり(前回 9/9)"]);
  });

  it("5. 2週以上続いていれば週連続", () => {
    expect(noteFor({ classType: "通常", prior: [rec("2026-09-23"), rec("2026-09-30")], today, history: "" })).toEqual(["2週連続・前回 9/30"]);
  });

  it("6. それ以外は直近28日の回数", () => {
    expect(noteFor({ classType: "通常", prior: [rec("2026-09-16"), rec("2026-09-30")], today, history: "" })).toEqual(["直近28日で2回・前回 9/30"]);
  });
});

describe("buildNotes", () => {
  it("今日の参加記録ごとに、今日より前の参加と利用歴から所見を作る", () => {
    const records = [
      rec("2026-09-30"),
      rec(today, { ordinal: 2 }),
      rec(today, { key: `${today}_20:00_lb:架空二郎`, personKey: "lb:架空二郎", ordinal: 1 }),
      rec(today, { key: `${today}_20:00_lb:架空三郎`, personKey: "lb:架空三郎", status: "キャンセル", ordinal: null }),
      rec("2026-10-09", { ordinal: 3 }),
    ];
    const trial: LedgerRow = {
      reservationNo: "#200",
      name: "架空二郎",
      date: "2026-09-22",
      startTime: "09:00",
      isCancelled: false,
      court: "HYROX",
      kind: "イベント",
      eventName: "HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）",
    };

    const notes = buildNotes({ today, records, historyIndex: new Map([["lb:架空二郎", [trial]]]) });

    expect([...notes]).toEqual([
      [`${today}_20:00_lb:架空一郎`, ["2回目(初参加 9/30)"]],
      [`${today}_20:00_lb:架空二郎`, ["初めての方。声かけをお願いします", "これまで: 体験会(9/22)"]],
    ]);
  });

  it("同じ日の前の回も過去の参加として数える(初日に2回出る人は、2回目の回で初参加扱いにならない)", () => {
    const first = `${today}_19:00`;
    const second = `${today}_20:00`;
    const records = [
      rec(today, { key: `${first}_lb:架空一郎`, sessionKey: first, startTime: "19:00", classType: "ビギナー", ordinal: 1 }),
      rec(today, { key: `${second}_lb:架空一郎`, sessionKey: second, startTime: "20:00", classType: "通常", ordinal: 2 }),
    ];

    const notes = buildNotes({ today, records, historyIndex: new Map() });

    expect(notes.get(`${first}_lb:架空一郎`)).toEqual(["初めての方。声かけをお願いします", "施設の利用も初めて"]);
    expect(notes.get(`${second}_lb:架空一郎`)).toEqual(["通常回は初めて(ビギナー1回)"]);
  });
});
