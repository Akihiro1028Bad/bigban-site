import { describe, it, expect } from "vitest";

import { OG_IMAGE } from "@/constants/site";

import { buildPageOpenGraph } from "./pageOpenGraph";

const base = {
  siteName: "THE PICKLE BANG THEORY",
  url: "http://localhost:3000/about",
};

describe("buildPageOpenGraph", () => {
  it("layout 由来の type / siteName を必ず明示する", () => {
    // ページ側 openGraph は layout の openGraph を置換するため、
    // 再指定しないと og:type・og:site_name が消える。
    const og = buildPageOpenGraph({ ...base, locale: "ja" });
    expect(og).toMatchObject({
      type: "website",
      siteName: "THE PICKLE BANG THEORY",
      url: "http://localhost:3000/about",
    });
  });

  it("title / description は明示しない", () => {
    // 明示すると inheritFromMetadata による継承が止まり、
    // og:title が title template 適用前の裸の値になる。
    const og = buildPageOpenGraph({ ...base, locale: "ja" });
    expect(og).not.toHaveProperty("title");
    expect(og).not.toHaveProperty("description");
  });

  it("ja は og:locale を ja_JP にする", () => {
    expect(buildPageOpenGraph({ ...base, locale: "ja" })?.locale).toBe("ja_JP");
  });

  it("ja 以外は og:locale を en_US にする", () => {
    expect(buildPageOpenGraph({ ...base, locale: "en" })?.locale).toBe("en_US");
  });

  it("images 未指定なら共通 OGP 画像を使う", () => {
    expect(buildPageOpenGraph({ ...base, locale: "ja" })?.images).toEqual([
      OG_IMAGE,
    ]);
  });

  it("images 指定時はページ固有画像を使う", () => {
    const custom = [
      { url: "http://localhost:3000/images/x.jpg", width: 1, height: 2 },
    ];
    expect(
      buildPageOpenGraph({ ...base, locale: "ja", images: custom })?.images,
    ).toEqual(custom);
  });
});
