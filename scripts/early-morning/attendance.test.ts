// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildAttendance } from "./attendance";
import type { LbReservation, TbEventDetail, TbParticipant } from "./types";

function tb(userId: number, name: string, status: TbParticipant["status"] = "APPROVE", isGuest = false): TbParticipant {
  return { userId, name, status, isGuest, appliedAt: `2026-09-01T0${userId % 10}:00:00.000+09:00` };
}

function event(id: number, date: string, participants: TbParticipant[], isCallOff = false): TbEventDetail {
  return { id, startAt: `${date}T06:00:00.000+09:00`, isCallOff, participants, ignoredStatusCount: 0 };
}

function lb(no: string, name: string, date: string, isCancelled = false): LbReservation {
  return { reservationNo: no, name, date, timeSlot: "06:00～08:00", isCancelled, receivedAt: "2026-09-02T10:00:00.000+09:00" };
}

describe("buildAttendance", () => {
  it("中止回・ゲストを除き、同日2イベントを1回にまとめる", () => {
    const result = buildAttendance({
      events: [
        event(1, "2026-08-25", [tb(11, "テスト太郎")], true),
        event(2, "2026-08-25", [tb(11, "テスト太郎"), tb(-1, "PBT CLUB会員枠1", "APPROVE", true)]),
        event(3, "2026-09-01", [tb(11, "新しい名前"), tb(12, "テスト次郎", "CANCEL")]),
      ],
      reservations: [],
      links: [],
      absentKeys: new Set(),
    });

    expect(result.sessions).toEqual([
      { date: "2026-08-25", tbEventIds: [1, 2], isCallOff: false, classType: "初中級" },
      { date: "2026-09-01", tbEventIds: [3], isCallOff: false, classType: "初中級" },
    ]);
    expect(result.people).toEqual([
      { key: "tb:11", displayName: "新しい名前", tbId: 11, lbName: null },
      { key: "tb:12", displayName: "テスト次郎", tbId: 12, lbName: null },
    ]);
    expect(result.records.map((r) => [r.key, r.status, r.ordinal, r.sources])).toEqual([
      ["2026-08-25_tb:11", "申込", 1, ["tb:2"]],
      ["2026-09-01_tb:11", "申込", 2, ["tb:3"]],
      ["2026-09-01_tb:12", "キャンセル", null, ["tb:3"]],
    ]);
  });

  it("全イベント中止の日は中止の開催回で、記録を作らない", () => {
    const result = buildAttendance({ events: [event(1, "2026-08-27", [tb(11, "テスト太郎")], true)], reservations: [], links: [], absentKeys: new Set() });
    expect(result.sessions).toEqual([{ date: "2026-08-27", tbEventIds: [1], isCallOff: true, classType: "中級以上" }]);
    expect(result.records).toEqual([]);
  });

  it("LaBOLA は氏名で数え、対応表があればテニスベアの人に寄せて経路を両方にする", () => {
    const result = buildAttendance({
      events: [event(3, "2026-09-08", [tb(11, "テスト太郎")]), event(4, "2026-09-15", [])],
      reservations: [
        lb("#692", "テスト　太郎", "2026-09-08"),
        lb("#871", "テスト太郎", "2026-09-15"),
        lb("#853", "テスト花子", "2026-09-08"),
        lb("#686", "テスト花子", "2026-09-10", true),
      ],
      links: [{ tbId: 11, lbName: "テスト太郎" }],
      absentKeys: new Set(),
    });

    expect(result.unmatchedReservations).toBe(1);
    expect(result.people).toEqual([
      { key: "tb:11", displayName: "テスト太郎", tbId: 11, lbName: "テスト太郎" },
      { key: "lb:テスト花子", displayName: "テスト花子", tbId: null, lbName: "テスト花子" },
    ]);
    expect(result.records.map((r) => [r.key, r.route, r.ordinal, r.sources])).toEqual([
      ["2026-09-08_lb:テスト花子", "LaBOLA", 1, ["lb:#853"]],
      ["2026-09-08_tb:11", "両方", 1, ["lb:#692", "tb:3"]],
      ["2026-09-15_tb:11", "LaBOLA", 2, ["lb:#871"]],
    ]);
  });

  it("キャンセルと申込が混ざれば申込、欠席の記録は回次を飛ばす", () => {
    const result = buildAttendance({
      events: [event(3, "2026-09-08", [tb(11, "テスト太郎", "CANCEL")]), event(4, "2026-09-15", [tb(11, "テスト太郎")]), event(5, "2026-09-22", [tb(11, "テスト太郎")])],
      reservations: [lb("#1", "テスト太郎", "2026-09-08")],
      links: [{ tbId: 11, lbName: "テスト太郎" }],
      absentKeys: new Set(["2026-09-15_tb:11"]),
    });

    expect(result.records.map((r) => [r.date, r.status, r.route, r.ordinal])).toEqual([
      ["2026-09-08", "申込", "LaBOLA", 1],
      ["2026-09-15", "申込", "テニスベア", null],
      ["2026-09-22", "申込", "テニスベア", 2],
    ]);
  });

  it("全出どころがキャンセルなら経路は全出どころ、申込日時は最も早いもの", () => {
    const result = buildAttendance({
      events: [event(3, "2026-09-08", [tb(11, "テスト太郎", "CANCEL")])],
      reservations: [lb("#1", "テスト太郎", "2026-09-08", true)],
      links: [{ tbId: 11, lbName: "テスト太郎" }],
      absentKeys: new Set(),
    });
    expect(result.records).toEqual([
      {
        key: "2026-09-08_tb:11",
        date: "2026-09-08",
        personKey: "tb:11",
        route: "両方",
        appliedAt: "2026-09-01T01:00:00.000+09:00",
        status: "キャンセル",
        sources: ["lb:#1", "tb:3"],
        ordinal: null,
      },
    ]);
  });

  it("対応表の人がテニスベアに出てこなければ、LaBOLA 氏名でテニスベア ID 付きの人を作る", () => {
    const result = buildAttendance({
      events: [event(3, "2026-09-08", [])],
      reservations: [lb("#1", "テスト花子", "2026-09-08")],
      links: [{ tbId: 99, lbName: "テスト花子" }],
      absentKeys: new Set(),
    });
    expect(result.people).toEqual([{ key: "tb:99", displayName: "テスト花子", tbId: 99, lbName: "テスト花子" }]);
    expect(result.records.map((r) => r.key)).toEqual(["2026-09-08_tb:99"]);
  });

  it("申込日時がどれも無ければ null", () => {
    const result = buildAttendance({
      events: [event(3, "2026-09-08", [{ ...tb(11, "テスト太郎"), appliedAt: null }])],
      reservations: [],
      links: [],
      absentKeys: new Set(),
    });
    expect(result.records[0].appliedAt).toBeNull();
  });
});
