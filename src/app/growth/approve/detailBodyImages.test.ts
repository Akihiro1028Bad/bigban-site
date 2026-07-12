import { describe, expect, it } from "vitest";

import { bodyImageUrlsOf } from "./detailBodyImages";

const A = "https://images.microcms-assets.io/img1.png";
const B = "https://images.microcms-assets.io/img2.png";

describe("bodyImageUrlsOf", () => {
  it("本文HTMLから本文画像 URL 列を抽出順で返す", () => {
    const html = `<figure><img src="${A}" alt="1"></figure><p>x</p><figure><img src="${B}" alt="2"></figure>`;
    expect(bodyImageUrlsOf(html)).toEqual([A, B]);
  });

  it("画像なしは空配列(bodyImages=0 相当)", () => {
    expect(bodyImageUrlsOf("<p>本文だけ</p>")).toEqual([]);
  });

  it("空文字は空配列", () => {
    expect(bodyImageUrlsOf("")).toEqual([]);
  });
});
