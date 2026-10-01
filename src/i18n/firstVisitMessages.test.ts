import { describe, it, expect } from "vitest";
import jaMessages from "../../messages/ja.json";
import enMessages from "../../messages/en.json";

const FORBIDDEN = [
  "天井",
  "照明",
  "ceiling",
  "lighting",
  "駐車場なし",
  "説明役",
  "体育館",
  "23:00",
  "11 PM",
];

function flatten(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flatten);
  }
  return [];
}

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, shape(v)]),
    );
  }
  return typeof value;
}

describe("FirstVisit メッセージ", () => {
  it("ja と en は同じ構造を持つ", () => {
    expect(shape(enMessages.FirstVisit)).toEqual(shape(jaMessages.FirstVisit));
  });

  it("方針で書かないと決めた語を含まない(ja/en)", () => {
    for (const messages of [jaMessages, enMessages]) {
      const text = flatten(messages.FirstVisit).join("\n");
      for (const word of FORBIDDEN) {
        expect(text).not.toContain(word);
      }
    }
  });

  it("ナビ・メタデータ・ホームリンクのキーが ja/en にある", () => {
    for (const messages of [jaMessages, enMessages]) {
      expect(messages.Navigation.firstVisit).toBe("FIRST VISIT");
      expect(messages.Metadata.firstVisit.title).not.toBe("");
      expect(messages.Metadata.firstVisit.description).not.toBe("");
      expect(messages.HomeUsageFlow.firstVisitLink).not.toBe("");
    }
    expect(jaMessages.Navigation.firstVisitJa).toBe("はじめての方へ");
    expect(enMessages.Navigation.firstVisitJa).toBe("");
  });

  it("受付開始日と1人参加の文言を含む", () => {
    const ja = flatten(jaMessages.FirstVisit).join("\n");
    expect(ja).toContain("{general}日前");
    expect(ja).toContain("施設主催のイベント");
    expect(ja).toContain("コインパーキング");
  });
});
