// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildAttendance } from "./attendance";
import type { LedgerRow } from "./types";

function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    reservationNo: "#100",
    name: "架空一郎",
    date: "2026-09-30",
    startTime: "20:00",
    isCancelled: false,
    court: "HYROX",
    kind: "イベント",
    eventName: "HYROX TRAINING @ DAISUKE CLASS",
    ...overrides,
  };
}

const noAlias = new Map<string, string>();
const noAbsent = new Set<string>();
const BEGINNER = "HYROX TRAINING @ DAISUKE CLASS ビギナーの部";

describe("buildAttendance", () => {
  it("DAISUKE のイベント予約だけから、開始時刻ごとの開催回を作り、イベント名が空の予約を数える", () => {
    const result = buildAttendance({
      rows: [
        row({ reservationNo: "#1", startTime: "19:00", eventName: BEGINNER }),
        row({ reservationNo: "#2", startTime: "20:00" }),
        row({ reservationNo: "#4", startTime: "09:00", eventName: "HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）" }),
        row({ reservationNo: "#5", kind: "スペース", eventName: "" }),
        row({ reservationNo: "#6", eventName: "" }),
      ],
      aliasMap: noAlias,
      absentKeys: noAbsent,
    });
    expect(result.sessions).toEqual([
      { key: "2026-09-30_19:00", date: "2026-09-30", startTime: "19:00", classType: "ビギナー", eventName: BEGINNER },
      { key: "2026-09-30_20:00", date: "2026-09-30", startTime: "20:00", classType: "通常", eventName: "HYROX TRAINING @ DAISUKE CLASS" },
    ]);
    expect(result.records.map((record) => record.key)).toEqual(["2026-09-30_19:00_lb:架空一郎", "2026-09-30_20:00_lb:架空一郎"]);
    expect(result.missingEventName).toBe(1);
  });

  it("同じ回の同じ人の予約は1記録にまとめ、有効が1件でもあれば申込にする", () => {
    const result = buildAttendance({
      rows: [row({ reservationNo: "#2" }), row({ reservationNo: "#1", isCancelled: true }), row({ reservationNo: "#3", isCancelled: true })],
      aliasMap: noAlias,
      absentKeys: noAbsent,
    });
    expect(result.records).toEqual([
      {
        key: "2026-09-30_20:00_lb:架空一郎",
        sessionKey: "2026-09-30_20:00",
        date: "2026-09-30",
        startTime: "20:00",
        classType: "通常",
        personKey: "lb:架空一郎",
        reservationNos: ["#1", "#2", "#3"],
        status: "申込",
        ordinal: 1,
      },
    ]);
  });

  it("キャンセルだけの人は回次なしのキャンセル。全員キャンセルの回も開催回に残し、表示名はキャンセルの表記を使う", () => {
    const result = buildAttendance({
      rows: [row({ isCancelled: true, name: "架空 一郎", eventName: "DAISUKE class（経験者）" })],
      aliasMap: noAlias,
      absentKeys: noAbsent,
    });
    expect(result.sessions.map((session) => session.eventName)).toEqual(["DAISUKE class（経験者）"]);
    expect(result.records[0]).toMatchObject({ status: "キャンセル", ordinal: null });
    expect(result.people).toEqual([{ key: "lb:架空一郎", displayName: "架空 一郎" }]);
  });

  it("開催回の代表は有効な予約の行にする", () => {
    const result = buildAttendance({
      rows: [row({ isCancelled: true, eventName: "DAISUKE class（経験者）" }), row({ name: "架空二郎" })],
      aliasMap: noAlias,
      absentKeys: noAbsent,
    });
    expect(result.sessions[0].eventName).toBe("HYROX TRAINING @ DAISUKE CLASS");
  });

  it("開催回の代表は予約番号が最小の行にする(入力の順序や桁数に依らない)", () => {
    const expected = "HYROX TRAINING @ DAISUKE CLASS";
    const validRows = [
      row({ reservationNo: "#10", eventName: "DAISUKE class（経験者）" }),
      row({ reservationNo: "#9", eventName: expected }),
      row({ reservationNo: "#11", eventName: "DAISUKE class（経験者）" }),
    ];
    const cancelledRows = [
      row({ reservationNo: "#10", isCancelled: true, eventName: "DAISUKE class（経験者）" }),
      row({ reservationNo: "#9", isCancelled: true, eventName: expected }),
    ];

    for (const rows of [validRows, [...validRows].reverse(), cancelledRows, [...cancelledRows].reverse()]) {
      const result = buildAttendance({ rows, aliasMap: noAlias, absentKeys: noAbsent });
      expect(result.sessions.map((session) => session.eventName)).toEqual([expected]);
    }
  });

  it("回次は日時順に数え、欠席の回は飛ばす", () => {
    const result = buildAttendance({
      rows: [row({ date: "2026-09-30" }), row({ date: "2026-09-23" }), row({ date: "2026-09-25" })],
      aliasMap: noAlias,
      absentKeys: new Set(["2026-09-25_20:00_lb:架空一郎"]),
    });
    expect(result.records.map((record) => [record.date, record.ordinal])).toEqual([
      ["2026-09-23", 1],
      ["2026-09-25", null],
      ["2026-09-30", 2],
    ]);
  });

  it("別名は統合先の人に寄せ、表示名は最新の有効な予約の表記にする", () => {
    const result = buildAttendance({
      rows: [
        row({ reservationNo: "#1", date: "2026-09-23", name: "かくう一郎" }),
        row({ reservationNo: "#2", date: "2026-09-30", name: "架空　一郎" }),
        row({ reservationNo: "#3", date: "2026-10-02", name: "架空一郎", isCancelled: true }),
      ],
      aliasMap: new Map([["lb:かくう一郎", "lb:架空一郎"]]),
      absentKeys: noAbsent,
    });
    expect(result.people).toEqual([{ key: "lb:架空一郎", displayName: "架空　一郎" }]);
    expect(result.records.map((record) => [record.personKey, record.ordinal])).toEqual([
      ["lb:架空一郎", 1],
      ["lb:架空一郎", 2],
      ["lb:架空一郎", null],
    ]);
  });
});
