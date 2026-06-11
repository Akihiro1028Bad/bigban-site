import { describe, it, expect } from "vitest";
import { parseKeywords } from "./og-utils";

describe("parseKeywords", () => {
  it("文字列配列をそのまま返す", () => {
    expect(parseKeywords(["a", "b"])).toEqual(["a", "b"]);
  });

  it("非文字列を除去する", () => {
    expect(parseKeywords(["a", 1, null, "b", undefined])).toEqual(["a", "b"]);
  });

  it("配列でない場合は空配列を返す", () => {
    expect(parseKeywords("not array")).toEqual([]);
    expect(parseKeywords(undefined)).toEqual([]);
    expect(parseKeywords(null)).toEqual([]);
    expect(parseKeywords({})).toEqual([]);
  });
});
