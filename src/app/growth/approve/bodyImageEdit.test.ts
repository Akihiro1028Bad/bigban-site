import { describe, expect, it } from "vitest";

import { listBodyImages, replaceBodyImageSrc } from "./bodyImageEdit";

const A = "https://images.microcms-assets.io/assets/a/1.png";
const B = "https://images.microcms-assets.io/assets/b/2.png";
const NEW = "https://images.microcms-assets.io/assets/c/new.png";

describe("listBodyImages", () => {
  it("microCMS アセットの本文画像だけを順に列挙する(src/alt)", () => {
    const html =
      `<p>導入</p>` +
      `<figure><img src="${A}" alt="図1"></figure>` +
      `<p>本文</p>` +
      `<figure><img src="${B}" alt="図2"></figure>`;
    expect(listBodyImages(html)).toEqual([
      { src: A, alt: "図1" },
      { src: B, alt: "図2" },
    ]);
  });

  it("microCMS 以外の img・画像なしは対象外", () => {
    expect(listBodyImages(`<img src="https://evil.com/x.png" alt="x">`)).toEqual([]);
    expect(listBodyImages(`<p>本文だけ</p>`)).toEqual([]);
  });

  it("alt が無い img は alt 空で列挙する", () => {
    expect(listBodyImages(`<img src="${A}">`)).toEqual([{ src: A, alt: "" }]);
  });
});

describe("replaceBodyImageSrc", () => {
  const html =
    `<figure><img src="${A}" alt="図1"></figure>` +
    `<figure><img src="${B}" alt="図2"></figure>`;

  it("指定インデックスの本文画像の src だけを差し替える(alt・他画像は保持)", () => {
    const out = replaceBodyImageSrc(html, 0, NEW);
    expect(out).toContain(`<img src="${NEW}" alt="図1">`);
    expect(out).toContain(`<img src="${B}" alt="図2">`);
  });

  it("末尾インデックスも差し替えできる", () => {
    const out = replaceBodyImageSrc(html, 1, NEW);
    expect(out).toContain(`<img src="${A}" alt="図1">`);
    expect(out).toContain(`<img src="${NEW}" alt="図2">`);
  });

  it("範囲外インデックスは何も変えない", () => {
    expect(replaceBodyImageSrc(html, 5, NEW)).toBe(html);
  });

  it("microCMS 以外の img は対象に数えない/触らない", () => {
    const mixed = `<img src="https://evil.com/x.png" alt="x"><img src="${A}" alt="図">`;
    const out = replaceBodyImageSrc(mixed, 0, NEW);
    expect(out).toContain(`https://evil.com/x.png`);
    expect(out).toContain(`<img src="${NEW}" alt="図">`);
  });

  it("URL に $ 特殊シーケンスが含まれても壊れず literal で入る(security H-1)", () => {
    const tricky = "https://images.microcms-assets.io/assets/x/$2$1.png";
    const out = replaceBodyImageSrc(`<img src="${A}" alt="図">`, 0, tricky);
    expect(out).toBe(`<img src="${tricky}" alt="図">`);
  });
});
