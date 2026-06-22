import { describe, expect, it } from "vitest";

import { clampIndex, isEditableTag, moveIndex, resolveShortcut } from "./shortcuts";

describe("isEditableTag", () => {
  it("input/textarea/select は true", () => {
    expect(isEditableTag("input")).toBe(true);
    expect(isEditableTag("TEXTAREA")).toBe(true);
    expect(isEditableTag("select")).toBe(true);
  });
  it("それ以外は false", () => {
    expect(isEditableTag("div")).toBe(false);
    expect(isEditableTag("button")).toBe(false);
  });
});

describe("resolveShortcut", () => {
  it("修飾なしのキー", () => {
    expect(resolveShortcut("j", false, false)).toBe("next");
    expect(resolveShortcut("k", false, false)).toBe("prev");
    expect(resolveShortcut("a", false, false)).toBe("approve");
    expect(resolveShortcut("r", false, false)).toBe("reject");
    expect(resolveShortcut("e", false, false)).toBe("edit");
    expect(resolveShortcut("/", false, false)).toBe("search");
    expect(resolveShortcut("Escape", false, false)).toBe("escape");
  });

  it("未対応キーは null", () => {
    expect(resolveShortcut("x", false, false)).toBeNull();
  });

  it("⌘K / Ctrl+K は palette", () => {
    expect(resolveShortcut("k", true, false)).toBe("palette");
    expect(resolveShortcut("K", false, true)).toBe("palette");
  });

  it("⌘/Ctrl + 他キーは無視", () => {
    expect(resolveShortcut("a", true, false)).toBeNull();
  });
});

describe("clampIndex", () => {
  it("範囲内に丸める", () => {
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(1, 3)).toBe(1);
  });
  it("空は -1", () => {
    expect(clampIndex(0, 0)).toBe(-1);
  });
});

describe("moveIndex", () => {
  it("delta だけ動かす", () => {
    expect(moveIndex(0, 1, 3)).toBe(1);
    expect(moveIndex(2, 1, 3)).toBe(2); // 末尾で頭打ち
    expect(moveIndex(0, -1, 3)).toBe(0); // 先頭で頭打ち
  });
  it("未選択(-1)は先頭起点", () => {
    expect(moveIndex(-1, 1, 3)).toBe(1);
    expect(moveIndex(-1, -1, 3)).toBe(0);
  });
  it("空は -1", () => {
    expect(moveIndex(0, 1, 0)).toBe(-1);
  });
});
