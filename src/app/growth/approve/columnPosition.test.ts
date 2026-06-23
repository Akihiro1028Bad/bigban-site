import { describe, expect, it } from "vitest";

import { activeColumnIndex } from "./columnPosition";

describe("activeColumnIndex", () => {
  // 横スクロール量 / 全体幅 / 列数 から、最も表示されている列の index を出す。
  it("先頭(scrollLeft=0)は0", () => {
    expect(activeColumnIndex(0, 1000, 4)).toBe(0);
  });

  it("1列ぶんスクロールで次の列へ(四捨五入)", () => {
    // stride = 1000/4 = 250。125以上で次の列に切り上がる。
    expect(activeColumnIndex(130, 1000, 4)).toBe(1);
    expect(activeColumnIndex(260, 1000, 4)).toBe(1);
    expect(activeColumnIndex(380, 1000, 4)).toBe(2);
  });

  it("末尾を超えても範囲内にクランプ", () => {
    expect(activeColumnIndex(99999, 1000, 4)).toBe(3);
  });

  it("負値は0にクランプ", () => {
    expect(activeColumnIndex(-50, 1000, 4)).toBe(0);
  });

  it("列が0/1、または幅0なら常に0(ゼロ除算回避)", () => {
    expect(activeColumnIndex(500, 1000, 1)).toBe(0);
    expect(activeColumnIndex(500, 1000, 0)).toBe(0);
    expect(activeColumnIndex(500, 0, 4)).toBe(0);
  });
});
