// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildHistoryIndex, historyBefore, summarizeHistory } from "./history";
import type { LedgerRow } from "./types";

const TRIAL = "HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）";

function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    reservationNo: "#200",
    name: "架空一郎",
    date: "2026-09-22",
    startTime: "09:00",
    isCancelled: false,
    court: "HYROX",
    kind: "イベント",
    memberNo: null,
    eventName: TRIAL,
    ...overrides,
  };
}

describe("summarizeHistory", () => {
  it("HYROX 系は短縮名ごと(1回なら日付、複数なら回数)、貸切とピックルは回数でまとめ、DAISUKE は数えない", () => {
    expect(
      summarizeHistory([
        row({ date: "2026-09-22" }),
        row({ date: "2026-09-26", eventName: "HYROX ミニシミュレーション（本番の半分の距離で8種目）", court: "A:アルテミス" }),
        row({ date: "2026-09-27", eventName: "HYROX ミニシミュレーション（アーリーアクセスコード付き）" }),
        row({ kind: "スペース", eventName: "" }),
        row({ kind: "スペース", eventName: "", court: "B:ビックバン" }),
        row({ eventName: "早朝ピックルボール（初中級）", court: "A:アルテミス" }),
        row({ eventName: "HYROX TRAINING @ DAISUKE CLASS" }),
      ]),
    ).toBe("体験会(9/22)・ミニシミュレーション 2回・HYROXエリア貸切 1回・ピックル 2回");
  });

  it("何もなければ空文字", () => {
    expect(summarizeHistory([])).toBe("");
  });
});

describe("buildHistoryIndex / historyBefore", () => {
  it("キャンセル・DAISUKE を除き、別名で寄せ、指定日より前の利用だけを要約する", () => {
    const index = buildHistoryIndex(
      [
        row({ name: "かくう一郎", date: "2026-09-22" }),
        row({ date: "2026-09-26", eventName: "HYROX ミニシミュレーション（本番の半分の距離で8種目）", isCancelled: true }),
        row({ date: "2026-09-30", eventName: "HYROX TRAINING @ DAISUKE CLASS" }),
        row({ date: "2026-10-07", eventName: "早朝ピックルボール（初中級）", court: "A:アルテミス" }),
        row({ date: "2026-10-01", kind: "スペース", eventName: "" }),
      ],
      new Map([["lb:かくう一郎", "lb:架空一郎"]]),
    );

    expect(historyBefore(index, "lb:架空一郎", "2026-10-07")).toBe("体験会(9/22)・HYROXエリア貸切 1回");
    expect(historyBefore(index, "lb:架空一郎", "2026-10-08")).toBe("体験会(9/22)・HYROXエリア貸切 1回・ピックル 1回");
    expect(historyBefore(index, "lb:未登録", "2026-10-08")).toBe("");
  });
});
