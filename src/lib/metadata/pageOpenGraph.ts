import { OG_IMAGE } from "@/constants/site";

import type { Metadata } from "next";

type OpenGraphImages = NonNullable<Metadata["openGraph"]>["images"];

interface PageOpenGraphOptions {
  /** `Metadata.og.siteName` の値 (layout と同じもの)。 */
  siteName: string;
  /** ページの自己参照 URL。 */
  url: string;
  /** アプリのロケール。og:locale へ変換する。 */
  locale: string;
  /** 省略時は共通 OGP 画像。ページ固有画像があるときだけ渡す。 */
  images?: OpenGraphImages;
}

/**
 * ページ側の openGraph ブロックを組み立てる。
 *
 * Next はページの openGraph を layout の openGraph と **マージせず置換** する
 * (`resolve-metadata.js` の `mergeMetadata`)。そのため各ページで同じ取りこぼしが
 * 起きやすく、実際に複数ページで og:type / og:site_name が欠落していた。
 * ルールをこの関数に閉じ込め、ページ側では組み立てさせない。
 *
 * 1. `type` / `siteName` / `locale` / `images` は毎回明示する。省略すると
 *    layout が与えていた og:type・og:site_name が消える。
 * 2. `title` / `description` は **明示しない**。指定すると `inheritFromMetadata`
 *    による継承が止まり、og:title が title template 適用前の裸の値になって
 *    ブランド名が落ちる。未指定なら解決済みの title/description を継承する。
 * 3. ページ側で `twitter` を設定しない (この関数の責務外だが同じ理由)。layout は
 *    `twitter.images` を意図的に未指定にしており、上書きすると twitter:image の
 *    og:image 追従が止まる。
 */
export function buildPageOpenGraph({
  siteName,
  url,
  locale,
  images,
}: PageOpenGraphOptions): Metadata["openGraph"] {
  return {
    type: "website",
    siteName,
    url,
    locale: locale === "ja" ? "ja_JP" : "en_US",
    images: images ?? [OG_IMAGE],
  };
}
