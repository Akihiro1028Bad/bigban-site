// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import { parseDecisions, toPendingItems } from "./approve";

function proposal(id: string, name: string, category: string): NotionPage {
  return {
    id,
    url: "",
    properties: {
      "施策名": { type: "title", title: [{ plain_text: name }] },
      "カテゴリ": { type: "select", select: { name: category } },
    },
  };
}

function idea(id: string, title: string, summary: string): NotionPage {
  return {
    id,
    url: "",
    properties: {
      "タイトル案": { type: "title", title: [{ plain_text: title }] },
      "概要": { type: "rich_text", rich_text: [{ plain_text: summary }] },
    },
  };
}

describe("toPendingItems", () => {
  it("施策提案と記事ネタ案を統一形式に整える", () => {
    const items = toPendingItems(
      [proposal("p1", "市川ページ", "サイト表示内容")],
      [idea("i1", "猛暑×屋内", "夏向けの集客記事")]
    );

    expect(items).toEqual([
      { id: "p1", kind: "proposal", title: "市川ページ", subtitle: "サイト表示内容" },
      { id: "i1", kind: "idea", title: "猛暑×屋内", subtitle: "夏向けの集客記事" },
    ]);
  });

  it("欠落プロパティは空文字で埋める", () => {
    const bare: NotionPage = { id: "x", url: "", properties: {} };
    expect(toPendingItems([bare], [bare])).toEqual([
      { id: "x", kind: "proposal", title: "", subtitle: "" },
      { id: "x", kind: "idea", title: "", subtitle: "" },
    ]);
  });

  it("plain_text 欠落の rich text 要素を空文字に落とす", () => {
    const noPlain: NotionPage = {
      id: "y",
      url: "",
      properties: {
        "施策名": { type: "title", title: [{}] },
        "概要": { type: "rich_text", rich_text: [{}] },
      },
    };
    expect(toPendingItems([noPlain], [noPlain])).toEqual([
      { id: "y", kind: "proposal", title: "", subtitle: "" },
      { id: "y", kind: "idea", title: "", subtitle: "" },
    ]);
  });
});

describe("parseDecisions", () => {
  it("正しい decisions 配列を返す", () => {
    const result = parseDecisions({
      decisions: [
        { id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "承認" },
        { id: "5adab8b1f1824123b9639463a2580d4a", decision: "却下" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "承認" });
  });

  it.each([
    [null, /不正なリクエスト/],
    [{}, /配列/],
    [{ decisions: "x" }, /配列/],
    [{ decisions: [null] }, /不正な項目/],
    [{ decisions: [{ id: 1, decision: "承認" }] }, /不正な id/],
    [{ decisions: [{ id: "bad id!", decision: "承認" }] }, /不正な id/],
    [{ decisions: [{ id: "abc", decision: "承認" }] }, /不正な id/],
    [
      { decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "保留" }] },
      /承認.*却下/,
    ],
  ])("不正な入力 %# を弾く", (input, pattern) => {
    expect(() => parseDecisions(input)).toThrow(pattern);
  });
});
