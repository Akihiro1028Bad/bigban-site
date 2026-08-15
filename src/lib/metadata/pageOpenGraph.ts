import { OG_IMAGE } from "@/constants/site";

import type { Metadata } from "next";

type OpenGraphImages = NonNullable<Metadata["openGraph"]>["images"];

interface PageOpenGraphBase {
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
}

/**
 * 画像の指定方法は排他。文字列センチネルにすると Next の画像型が string を
 * 含むため union が潰れ、タイプミスが型エラーにならず 404 の og:image を
 * 出しつつファイル規約も殺す、という最悪の組み合わせになる。
 */
type PageOpenGraphImages =
  | {
      /**
       * images キー自体を出力しない。Next の `mergeStaticMetadata` は
       * 「ページが images を持たないとき」だけ `opengraph-image.tsx` の
       * ファイル規約を適用するため、記事アイキャッチを og:image に出したい面で
       * 指定する。
       */
      shouldUseFileImage: true;
      images?: never;
    }
  | {
      shouldUseFileImage?: false;
      /** 省略時は共通 OGP 画像。ページ固有画像があるときだけ渡す。 */
      images?: OpenGraphImages;
    };

type PageOpenGraphOptions = PageOpenGraphBase & PageOpenGraphImages;

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
  shouldUseFileImage,
  images,
}: PageOpenGraphOptions): Metadata["openGraph"] {
  const base = {
    siteName,
    url,
    locale: locale === "ja" ? "ja_JP" : "en_US",
    // ファイル規約に委ねるときはキーごと落とす。
    ...(shouldUseFileImage ? {} : { images: images ?? [OG_IMAGE] }),
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
