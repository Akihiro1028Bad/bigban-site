// @vitest-environment node
import { describe, expect, it } from "vitest";

import { classOf, historyCategoryOf, isDaisuke, shortEventName } from "./classify";
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

describe("isDaisuke", () => {
  it.each([
    ["HYROX TRAINING @ DAISUKE CLASS", true],
    ["DAISUKE class（経験者）", true],
    ["HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）", false],
    ["", false],
  ])("%s → %s", (name, expected) => {
    expect(isDaisuke(name)).toBe(expected);
  });
});

describe("classOf", () => {
  it.each([
    ["HYROX TRAINING @ DAISUKE CLASS　ビギナーの部", "ビギナー"],
    ["DAISUKE class（ビギナー）", "ビギナー"],
    ["HYROX TRAINING @ DAISUKE CLASS ダブルスクラス", "ダブルス"],
    ["DAISUKE class（経験者）", "通常"],
    ["HYROX TRAINING @ DAISUKE CLASS", "通常"],
  ])("%s → %s", (name, expected) => {
    expect(classOf(name)).toBe(expected);
  });
});

describe("shortEventName", () => {
  it.each([
    ["HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）", "体験会"],
    ["HYROX TRAINING｜モーニングクラス（経験者向け）", "モーニングクラス"],
    ["HYROX ミニシミュレーション（本番の半分の距離で8種目）", "ミニシミュレーション"],
    ["ピクロックス（ピックルボール体験×HYROX体験）", "ピクロックス"],
    ["ハイロックスクラス", "HYROXイベント"],
  ])("%s → %s", (name, expected) => {
    expect(shortEventName(name)).toBe(expected);
  });
});

describe("historyCategoryOf", () => {
  it("DAISUKE CLASS とイベント名が空のイベントは数えない", () => {
    expect(historyCategoryOf(row())).toBeNull();
    expect(historyCategoryOf(row({ eventName: "" }))).toBeNull();
  });

  it("ピックルのコートで記帳された HYROX イベントも HYROX 系にする", () => {
    expect(
      historyCategoryOf(row({ court: "A:アルテミス", eventName: "HYROX ミニシミュレーション（アーリーアクセスコード付き）" })),
    ).toEqual({ kind: "HYROXイベント", shortName: "ミニシミュレーション" });
    expect(historyCategoryOf(row({ court: "B:ビックバン", eventName: "ピクロックス（ピックルボール体験×HYROX体験）" }))).toEqual({
      kind: "HYROXイベント",
      shortName: "ピクロックス",
    });
  });

  it("HYROX を含まないイベントはピックル", () => {
    expect(historyCategoryOf(row({ court: "A:アルテミス", eventName: "早朝ピックルボール（初中級）" }))).toEqual({ kind: "ピックル" });
  });

  it("スペース予約は HYROX エリアなら貸切、A/B/C ならピックル、それ以外は数えない", () => {
    expect(historyCategoryOf(row({ kind: "スペース", eventName: "" }))).toEqual({ kind: "HYROXエリア貸切" });
    expect(historyCategoryOf(row({ kind: "スペース", eventName: "", court: "C:コメット" }))).toEqual({ kind: "ピックル" });
    expect(historyCategoryOf(row({ kind: "スペース", eventName: "", court: "その他" }))).toBeNull();
    expect(historyCategoryOf(row({ kind: "スペース", eventName: "", court: null }))).toBeNull();
  });
});
