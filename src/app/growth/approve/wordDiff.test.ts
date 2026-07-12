import { describe, expect, it } from "vitest";

import { wordDiff } from "./wordDiff";

describe("wordDiff", () => {
  it("同一文字列は same 1つ", () => {
    expect(wordDiff("市川の屋内コート", "市川の屋内コート")).toEqual([
      { type: "same", text: "市川の屋内コート" },
    ]);
  });

  it("末尾追加は same→add", () => {
    expect(wordDiff("夜の", "夜のラリー")).toEqual([
      { type: "same", text: "夜の" },
      { type: "add", text: "ラリー" },
    ]);
  });

  it("末尾削除は same→del", () => {
    expect(wordDiff("夜のラリー", "夜の")).toEqual([
      { type: "same", text: "夜の" },
      { type: "del", text: "ラリー" },
    ]);
  });

  it("置換は del→add(連続同種はまとめる)", () => {
    const segs = wordDiff("赤い車", "青い車");
    expect(segs).toEqual([
      { type: "del", text: "赤" },
      { type: "add", text: "青" },
      { type: "same", text: "い車" },
    ]);
  });

  it("空→新規は add のみ、元→空は del のみ", () => {
    expect(wordDiff("", "新")).toEqual([{ type: "add", text: "新" }]);
    expect(wordDiff("旧", "")).toEqual([{ type: "del", text: "旧" }]);
    expect(wordDiff("", "")).toEqual([]);
  });
});
