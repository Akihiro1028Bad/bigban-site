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
  /** 既定は "website"。記事面 (news / columns 詳細) は "article"。 */
  type?: "website" | "article";
  /** type="article" のときの公開日時 (ISO8601)。 */
  publishedTime?: string;
  /** type="article" のときの更新日時 (ISO8601)。 */
  modifiedTime?: string;
  /**
   * 省略時は共通 OGP 画像。ページ固有画像があるときは配列を渡す。
   *
   * `"file"` を渡すと images キー自体を出力しない。Next の
   * `mergeStaticMetadata` は「ページが images を持たないとき」だけ
   * `opengraph-image.tsx` のファイル規約を適用するため、記事アイキャッチを
   * og:image に出したい面ではキーごと出さない必要がある。
   */
  images?: OpenGraphImages | "file";
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
  type = "website",
  publishedTime,
  modifiedTime,
  images,
}: PageOpenGraphOptions): Metadata["openGraph"] {
  const base = {
    siteName,
    url,
    locale: locale === "ja" ? "ja_JP" : "en_US",
    // "file" のときはキーごと落とす (ファイル規約の画像を活かすため)。
    ...(images === "file" ? {} : { images: images ?? [OG_IMAGE] }),
  };
  if (type === "article") {
    return {
      ...base,
      type,
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    };
  }
  return { ...base, type };
}
