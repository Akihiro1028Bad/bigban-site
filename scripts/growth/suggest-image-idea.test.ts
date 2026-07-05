import { describe, expect, it } from "vitest";

import { suggestImageIdea } from "./suggest-image-idea";
import type { RequestedBodyImageStyle } from "./body-image";

const FORBIDDEN_UNCONFIRMED_NUMBERS = /(?:¥|￥|\d+\s*(?:分|時間|面|円)|[一二三四五六七八九十]+\s*(?:分|時間|面|円))/;

describe("suggestImageIdea", () => {
  it.each([
    ["court", "ルールとコートの広さ", "俯瞰コート図"],
    ["flow", "予約から体験までの手順", "フロー図"],
    ["infographic", "ラケットの選び方と違い", "比較インフォグラフィック"],
    ["mascot", "初心者が基本ルールを覚える", "宇宙人"],
    ["illust", "施設で過ごす雰囲気", "抽象イラスト"],
    ["auto", "雨の日でも楽しめる理由", "このセクションに合う図"],
  ] satisfies [RequestedBodyImageStyle, string, string][])(
    "%s は代表見出しからスタイルに合う切り口を返す",
    (style, heading, expected) => {
      expect(suggestImageIdea(heading, style)).toContain(expected);
    },
  );

  it.each([
    ["court", "週末の過ごし方", "俯瞰コート図"],
    ["flow", "週末の過ごし方", "フロー図"],
    ["infographic", "週末の過ごし方", "インフォグラフィック"],
    ["mascot", "週末の過ごし方", "宇宙人"],
    ["illust", "週末の過ごし方", "抽象イラスト"],
    ["auto", "週末の過ごし方", "このセクションに合う図"],
  ] satisfies [RequestedBodyImageStyle, string, string][])(
    "%s はキーワード非ヒットでもスタイル既定文を返す",
    (style, heading, expected) => {
      expect(suggestImageIdea(heading, style)).toContain(expected);
    },
  );

  it("空見出しでも非空の中立フォールバックを返す", () => {
    expect(suggestImageIdea("  ", "auto").trim()).toBe("このセクションに合う図を提案する");
  });

  it.each([
    ["court", "ネット付近の立ち位置", "位置関係"],
    ["flow", "体験前の準備", "までの流れ"],
    ["infographic", "失敗しないための注意点", "要点"],
    ["mascot", "施設のスペース紹介", "指し示す"],
    ["mascot", "ラケットの選び方比較", "見比べる"],
    ["mascot", "体験レッスンの予約", "誘う"],
    ["illust", "気軽に交流できる安心感", "感覚"],
    ["auto", "予約の流れ", "流れが伝わる図"],
    ["auto", "初心者向けの比較", "比べやすい図"],
  ] satisfies [RequestedBodyImageStyle, string, string][])(
    "%s は追加キーワードに対応した説明を返す",
    (style, heading, expected) => {
      expect(suggestImageIdea(heading, style)).toContain(expected);
    },
  );

  it("空見出しの非autoスタイルは中立トピックを使う", () => {
    expect(suggestImageIdea("\n\t", "mascot")).toBe("宇宙人がこのセクションを楽しく紹介する");
  });

  it("未確定の営業時間・料金・面数・所要時間を固定文言に混ぜない", () => {
    const styles: RequestedBodyImageStyle[] = [
      "auto",
      "mascot",
      "illust",
      "court",
      "flow",
      "infographic",
    ];

    for (const style of styles) {
      expect(suggestImageIdea("料金と営業時間の確認", style)).not.toMatch(FORBIDDEN_UNCONFIRMED_NUMBERS);
    }
  });
});
