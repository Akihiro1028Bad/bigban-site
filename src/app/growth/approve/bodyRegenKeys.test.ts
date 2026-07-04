import { describe, expect, it } from "vitest";

import { bodyRegenIndices } from "./bodyRegenKeys";

const A = "https://images.microcms-assets.io/img1.png";
const B = "https://images.microcms-assets.io/img2.png";
const C = "https://images.microcms-assets.io/img3.png";

describe("bodyRegenIndices", () => {
  it("targetSrc が抽出順の何番目かを索く", () => {
    expect(bodyRegenIndices([A, B, C], B)).toEqual([1]);
    expect(bodyRegenIndices([A, B, C], A)).toEqual([0]);
  });

  it("targetSrc が本文に無ければ全インデックスを保守的に返す", () => {
    expect(bodyRegenIndices([A, B], C)).toEqual([0, 1]);
  });

  it("targetSrc が空なら全インデックス", () => {
    expect(bodyRegenIndices([A, B], "")).toEqual([0, 1]);
  });

  it("本文画像 0 枚なら空配列", () => {
    expect(bodyRegenIndices([], A)).toEqual([]);
  });
});
