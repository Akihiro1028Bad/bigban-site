// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  chunkText,
  prop,
  readDate,
  readMultiSelect,
  readNumber,
  readPlainText,
  readSelect,
  type NotionPage,
} from "./notionProps";

const page: NotionPage = {
  id: "p1",
  properties: {
    名前: { type: "title", title: [{ plain_text: "テスト" }, { plain_text: "太郎" }] },
    メモ: { type: "rich_text", rich_text: [{ plain_text: "abc" }] },
    数: { type: "number", number: 3 },
    種別: { type: "select", select: { name: "常連" } },
    空種別: { type: "select", select: null },
    節目: { type: "multi_select", multi_select: [{ name: "5" }, { name: "10" }] },
    日: { type: "date", date: { start: "2026-09-22" } },
    空日: { type: "date", date: null },
  },
};

describe("prop", () => {
  it("Notion API の値の形を作る", () => {
    expect(prop.title("a")).toEqual({ title: [{ type: "text", text: { content: "a" } }] });
    expect(prop.text(null)).toEqual({ rich_text: [] });
    expect(prop.text("b")).toEqual({ rich_text: [{ type: "text", text: { content: "b" } }] });
    expect(prop.number(null)).toEqual({ number: null });
    expect(prop.date("2026-09-22")).toEqual({ date: { start: "2026-09-22" } });
    expect(prop.date(null)).toEqual({ date: null });
    expect(prop.select("常連")).toEqual({ select: { name: "常連" } });
    expect(prop.select(null)).toEqual({ select: null });
    expect(prop.multiSelect(["5"])).toEqual({ multi_select: [{ name: "5" }] });
    expect(prop.checkbox(true)).toEqual({ checkbox: true });
    expect(prop.relation(["x"])).toEqual({ relation: [{ id: "x" }] });
  });

  it("2000文字ごとに分ける", () => {
    expect(chunkText("a".repeat(4001)).map((c) => c.length)).toEqual([2000, 2000, 1]);
    expect(chunkText("")).toEqual([]);
  });
});

describe("read*", () => {
  it("各型の値を読む", () => {
    expect(readPlainText(page, "名前")).toBe("テスト太郎");
    expect(readPlainText(page, "メモ")).toBe("abc");
    expect(readNumber(page, "数")).toBe(3);
    expect(readSelect(page, "種別")).toBe("常連");
    expect(readSelect(page, "空種別")).toBeNull();
    expect(readMultiSelect(page, "節目")).toEqual(["5", "10"]);
    expect(readDate(page, "日")).toBe("2026-09-22");
    expect(readDate(page, "空日")).toBeNull();
  });

  it("列がない・型が違うときは空の値", () => {
    expect(readPlainText(page, "なし")).toBe("");
    expect(readNumber(page, "種別")).toBeNull();
    expect(readSelect(page, "なし")).toBeNull();
    expect(readMultiSelect(page, "なし")).toEqual([]);
    expect(readDate(page, "なし")).toBeNull();
  });
});
