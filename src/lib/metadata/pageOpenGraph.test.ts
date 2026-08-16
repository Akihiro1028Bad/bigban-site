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

  it("type 未指定は website", () => {
    expect(buildPageOpenGraph({ ...base, locale: "ja" })).toMatchObject({
      type: "website",
    });
  });

  it("記事面は type=article と日時を出せる", () => {
    const og = buildPageOpenGraph({
      ...base,
      locale: "ja",
      type: "article",
      publishedTime: "2026-04-01T00:00:00.000Z",
      modifiedTime: "2026-04-02T00:00:00.000Z",
    });
    expect(og).toMatchObject({
      type: "article",
      publishedTime: "2026-04-01T00:00:00.000Z",
      modifiedTime: "2026-04-02T00:00:00.000Z",
    });
  });

  it("type=article を書かずに日時だけ渡せない (型で禁止)", () => {
    // 基底に日時を置くと type の書き忘れで og:type と日時を静かに落とす。
    // @ts-expect-error 日時は type="article" のときだけ受け付ける。
    const og = buildPageOpenGraph({
      ...base,
      locale: "ja",
      publishedTime: "2026-04-01T00:00:00.000Z",
    });
    expect(og).toMatchObject({ type: "website" });
  });

  it("type=article で日時未指定なら日時キーを出さない", () => {
    const og = buildPageOpenGraph({ ...base, locale: "ja", type: "article" });
    expect(og).not.toHaveProperty("publishedTime");
    expect(og).not.toHaveProperty("modifiedTime");
  });

  it("shouldUseFileImage は images キー自体を出さない", () => {
    // Next の mergeStaticMetadata は「ページが images を持たないとき」だけ
    // opengraph-image.tsx のファイル規約を適用する。記事アイキャッチを
    // 活かすため、キーごと出さない必要がある。
    const og = buildPageOpenGraph({
      ...base,
      locale: "ja",
      shouldUseFileImage: true,
    });
    expect(og).not.toHaveProperty("images");
  });

  it("shouldUseFileImage と images は同時に渡せない (型で禁止)", () => {
    // @ts-expect-error ファイル規約に委ねる指定と明示画像は両立しない。
    // この呼び出しが型エラーでなくなったら判別ユニオンが壊れている
    // (文字列センチネルに戻すと Next の画像型が string を含むため潰れる)。
    const og = buildPageOpenGraph({
      ...base,
      locale: "ja",
      shouldUseFileImage: true,
      images: [{ url: "http://localhost:3000/x.jpg" }],
    });
    expect(og).not.toHaveProperty("images");
  });
});
