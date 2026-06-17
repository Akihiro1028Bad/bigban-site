// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import { parseDecisions, pendingStatus, toPendingItems } from "./approve";

function proposal(id: string, name: string, category: string): NotionPage {
  return {
    id,
    url: "",
    properties: {
      "施策名": { type: "title", title: [{ plain_text: name }] },
      "カテゴリ": { type: "select", select: { name: category } },
      "優先度スコア": { type: "number", number: 8.5 },
      "確度": { type: "select", select: { name: "高" } },
      "インパクト": { type: "select", select: { name: "大" } },
      "根拠": { type: "rich_text", rich_text: [{ plain_text: "MEOクエリが増加" }] },
      "想定アクション": { type: "rich_text", rich_text: [{ plain_text: "GBPを更新" }] },
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
      "優先度": { type: "select", select: { name: "中" } },
      "根拠": { type: "rich_text", rich_text: [{ plain_text: "関連検索が前月比2.1倍" }] },
      "構成案": { type: "rich_text", rich_text: [{ plain_text: "導入→H2基準3つ→CTA" }] },
    },
  };
}

describe("toPendingItems", () => {
  it("施策提案は判断根拠(優先度スコア/確度/インパクト/根拠/想定アクション)を details に持つ", () => {
    const [item] = toPendingItems([proposal("p1", "市川ページ", "サイト表示内容")], []);

    expect(item).toMatchObject({
      id: "p1",
      kind: "proposal",
      title: "市川ページ",
      subtitle: "サイト表示内容",
    });
    expect(item.details).toEqual([
      { label: "優先度スコア", value: "8.5" },
      { label: "確度", value: "高" },
      { label: "インパクト", value: "大" },
      { label: "根拠", value: "MEOクエリが増加" },
      { label: "想定アクション", value: "GBPを更新" },
    ]);
  });

  it("記事ネタ案は優先度と概要を持つ", () => {
    const [item] = toPendingItems([], [idea("i1", "猛暑×屋内", "夏向けの集客記事")]);

    expect(item).toMatchObject({
      id: "i1",
      kind: "idea",
      title: "猛暑×屋内",
      subtitle: "夏向けの集客記事",
    });
    expect(item.details).toEqual([
      { label: "優先度", value: "中" },
      { label: "根拠", value: "関連検索が前月比2.1倍" },
      { label: "構成案", value: "導入→H2基準3つ→CTA" },
    ]);
  });

  it("記事ネタ案の根拠が空なら details から除外する(#238)", () => {
    const noRationale: NotionPage = {
      id: "i2",
      url: "",
      properties: {
        "タイトル案": { type: "title", title: [{ plain_text: "B" }] },
        "優先度": { type: "select", select: { name: "高" } },
      },
    };
    const [item] = toPendingItems([], [noRationale]);
    expect(item.details).toEqual([{ label: "優先度", value: "高" }]);
  });

  it("欠落プロパティは空文字・空 details で埋める", () => {
    const bare: NotionPage = { id: "x", url: "", properties: {} };
    expect(toPendingItems([bare], [bare])).toEqual([
      { id: "x", kind: "proposal", title: "", subtitle: "", details: [] },
      { id: "x", kind: "idea", title: "", subtitle: "", details: [] },
    ]);
  });

  it("優先度スコアが数値でない場合は details から除外する", () => {
    const noScore: NotionPage = {
      id: "z",
      url: "",
      properties: {
        "施策名": { type: "title", title: [{ plain_text: "A" }] },
        "確度": { type: "select", select: { name: "中" } },
      },
    };
    const [item] = toPendingItems([noScore], []);
    expect(item.details).toEqual([{ label: "確度", value: "中" }]);
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
      { id: "y", kind: "proposal", title: "", subtitle: "", details: [] },
      { id: "y", kind: "idea", title: "", subtitle: "", details: [] },
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

  it("承認待ちへ戻すステータス(未処理/提案中)も受け付ける(#235 取り消し)", () => {
    const result = parseDecisions({
      decisions: [
        { id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "未処理" },
        { id: "5adab8b1f1824123b9639463a2580d4a", decision: "提案中" },
      ],
    });
    expect(result).toEqual([
      { id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "未処理" },
      { id: "5adab8b1f1824123b9639463a2580d4a", decision: "提案中" },
    ]);
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

describe("pendingStatus", () => {
  it("施策提案の承認待ちは未処理", () => {
    expect(pendingStatus("proposal")).toBe("未処理");
  });

  it("記事ネタ案の承認待ちは提案中", () => {
    expect(pendingStatus("idea")).toBe("提案中");
  });
});
