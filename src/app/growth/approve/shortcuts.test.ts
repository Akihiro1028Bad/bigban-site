import { describe, expect, it } from "vitest";

import {
  clampIndex,
  isEditableTag,
  moveIndex,
  resolveShortcut,
  shouldBlockSingleKeys,
} from "./shortcuts";

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

  it("x は選択トグル、1/2/3 はタブ切替、? はヘルプ", () => {
    expect(resolveShortcut("x", false, false)).toBe("select-toggle");
    expect(resolveShortcut("1", false, false)).toBe("tab-outline");
    expect(resolveShortcut("2", false, false)).toBe("tab-preview");
    expect(resolveShortcut("3", false, false)).toBe("tab-material");
    expect(resolveShortcut("?", false, false)).toBe("help");
  });

  it("未対応キーは null", () => {
    expect(resolveShortcut("z", false, false)).toBeNull();
    expect(resolveShortcut("4", false, false)).toBeNull();
  });

  it("⌘K / Ctrl+K は palette", () => {
    expect(resolveShortcut("k", true, false)).toBe("palette");
    expect(resolveShortcut("K", false, true)).toBe("palette");
  });

  it("⌘/Ctrl + 他キーは無視(? も含む)", () => {
    expect(resolveShortcut("a", true, false)).toBeNull();
    expect(resolveShortcut("?", true, false)).toBeNull();
    expect(resolveShortcut("1", false, true)).toBeNull();
  });
});

describe("shouldBlockSingleKeys", () => {
  it("palette / escape はオーバーレイ開放中でも抑止しない", () => {
    expect(shouldBlockSingleKeys(true, "palette")).toBe(false);
    expect(shouldBlockSingleKeys(true, "escape")).toBe(false);
  });

  it("オーバーレイ開放中は palette/escape 以外を抑止する", () => {
    expect(shouldBlockSingleKeys(true, "approve")).toBe(true);
    expect(shouldBlockSingleKeys(true, "next")).toBe(true);
    expect(shouldBlockSingleKeys(true, "select-toggle")).toBe(true);
    expect(shouldBlockSingleKeys(true, "tab-material")).toBe(true);
    expect(shouldBlockSingleKeys(true, "help")).toBe(true);
  });

  it("オーバーレイ非開放時はどの action も抑止しない", () => {
    expect(shouldBlockSingleKeys(false, "approve")).toBe(false);
    expect(shouldBlockSingleKeys(false, "palette")).toBe(false);
    expect(shouldBlockSingleKeys(false, "escape")).toBe(false);
    expect(shouldBlockSingleKeys(false, "help")).toBe(false);
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
