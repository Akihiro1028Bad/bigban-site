// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  PROPOSAL_CATEGORIES,
  parseProposalInput,
  proposalProperties,
  proposalToItem,
} from "./proposals";

describe("parseProposalInput", () => {
  it("施策名・カテゴリ・メモを整形して返す", () => {
    expect(
      parseProposalInput({ name: "  平日昼クーポン ", category: " MEO ", note: " LINE配布 " })
    ).toEqual({ name: "平日昼クーポン", category: "MEO", note: "LINE配布" });
  });

  it("カテゴリ・メモは省略可(空文字になる)", () => {
    expect(parseProposalInput({ name: "施策A" })).toEqual({
      name: "施策A",
      category: "",
      note: "",
    });
  });

  it.each([
    [null, /不正なリクエスト/],
    ["x", /不正なリクエスト/],
    [{}, /施策名を入力/],
    [{ name: "   " }, /施策名を入力/],
    [{ name: 123 }, /施策名を入力/],
    [{ name: "a".repeat(201) }, /施策名が長すぎ/],
    [{ name: "A", category: "c".repeat(51) }, /カテゴリが長すぎ/],
    [{ name: "A", note: "n".repeat(2001) }, /メモが長すぎ/],
  ])("不正な入力 %# を弾く", (input, pattern) => {
    expect(() => parseProposalInput(input)).toThrow(pattern);
  });
});

describe("proposalProperties", () => {
  it("施策名とステータス(未処理)を必ず含む", () => {
    expect(proposalProperties({ name: "施策A", category: "", note: "" })).toEqual({
      "施策名": { title: [{ text: { content: "施策A" } }] },
      "ステータス": { select: { name: "未処理" } },
    });
  });

  it("カテゴリ・想定アクションは値があるときだけ含む", () => {
    expect(
      proposalProperties({ name: "施策A", category: "MEO", note: "GBP更新" })
    ).toEqual({
      "施策名": { title: [{ text: { content: "施策A" } }] },
      "ステータス": { select: { name: "未処理" } },
      "カテゴリ": { select: { name: "MEO" } },
      "想定アクション": { rich_text: [{ text: { content: "GBP更新" } }] },
    });
  });
});

describe("proposalToItem", () => {
  it("承認待ち施策の表示用アイテムを作る", () => {
    expect(
      proposalToItem("38099efa-346b-8122-9681-f4d2cc321a31", {
        name: "施策A",
        category: "MEO",
        note: "GBP更新",
      })
    ).toEqual({
      id: "38099efa-346b-8122-9681-f4d2cc321a31",
      kind: "proposal",
      title: "施策A",
      subtitle: "MEO",
      details: [{ label: "想定アクション", value: "GBP更新" }],
      score: 0,
      stage: "untouched",
    });
  });

  it("メモが無ければ details は空", () => {
    const item = proposalToItem("id", { name: "A", category: "", note: "" });
    expect(item.details).toEqual([]);
    expect(item.subtitle).toBe("");
  });
});

describe("PROPOSAL_CATEGORIES", () => {
  it("施策提案の6カテゴリを持つ", () => {
    expect(PROPOSAL_CATEGORIES).toEqual([
      "コンテンツ",
      "MEO",
      "サイトデザイン",
      "サイト表示内容",
      "追加機能",
      "イベント",
    ]);
  });
});
