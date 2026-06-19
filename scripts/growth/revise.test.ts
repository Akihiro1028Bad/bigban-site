// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildReviseRequestProps,
  parseReviseInstructions,
  REVISE_BUSY_STATUSES,
  REVISE_PROPS,
  REVISE_STATUSES,
  serializeReviseInstructions,
  type ReviseComment,
} from "./revise";

describe("REVISE 定数", () => {
  it("プロパティ名・ステータス・busy 集合を提供する", () => {
    expect(REVISE_PROPS).toEqual({
      instructions: "修正指示",
      status: "修正ステータス",
      proposal: "修正案",
      requestedAt: "修正依頼時刻",
    });
    expect(REVISE_STATUSES).toContain("提示中");
    expect(REVISE_BUSY_STATUSES).toEqual(["依頼中", "処理中", "提示中"]);
  });
});

describe("serializeReviseInstructions", () => {
  it("行コメント配列を JSON 化し、前後空白を整える", () => {
    const comments: ReviseComment[] = [
      { line: " ## 市川でできる場所は3つ ", comment: " 3つを箇条書きで " },
    ];
    expect(serializeReviseInstructions(comments)).toBe(
      JSON.stringify([{ line: "## 市川でできる場所は3つ", comment: "3つを箇条書きで" }])
    );
  });

  it("空配列は弾く", () => {
    expect(() => serializeReviseInstructions([])).toThrow(/空です/);
  });

  it("line / comment が空の要素は弾く", () => {
    expect(() =>
      serializeReviseInstructions([{ line: "  ", comment: "x" }])
    ).toThrow(/不正/);
    expect(() =>
      serializeReviseInstructions([{ line: "h", comment: "" }])
    ).toThrow(/不正/);
  });
});

describe("parseReviseInstructions", () => {
  it("serialize と往復できる", () => {
    const json = serializeReviseInstructions([{ line: "見出しA", comment: "短く" }]);
    expect(parseReviseInstructions(json)).toEqual([{ line: "見出しA", comment: "短く" }]);
  });

  it("不正な JSON は弾く", () => {
    expect(() => parseReviseInstructions("not json")).toThrow(/解釈できません/);
  });

  it("配列でない / 空配列は弾く", () => {
    expect(() => parseReviseInstructions('{"line":"a"}')).toThrow(/配列/);
    expect(() => parseReviseInstructions("[]")).toThrow(/配列/);
  });

  it("要素の line / comment が不正なら弾く", () => {
    expect(() => parseReviseInstructions('[{"line":"a"}]')).toThrow(/不正/);
    expect(() => parseReviseInstructions('[{"line":"","comment":"c"}]')).toThrow(/不正/);
  });
});

describe("buildReviseRequestProps", () => {
  it("修正指示(分割rich_text)・依頼中・依頼時刻を1まとめにする", () => {
    const json = serializeReviseInstructions([{ line: "見出し", comment: "短く" }]);
    const props = buildReviseRequestProps(json, "2026-06-19T01:00:00.000Z");
    expect(props).toEqual({
      "修正指示": { rich_text: [{ text: { content: json } }] },
      "修正ステータス": { select: { name: "依頼中" } },
      "修正依頼時刻": { date: { start: "2026-06-19T01:00:00.000Z" } },
    });
  });
});
