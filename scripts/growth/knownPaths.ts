import type { ArticleSegment } from "./endpoint";

export interface ArticleSlug {
  locale: string;
  slug: string;
}

/**
 * 公開記事 slug 一覧を壊れ内部リンク検査用の既知パスへ変換する。
 * ja 記事のみ `/ja/{news|columns}/{slug}` として検査対象にする。
 */
export function buildKnownArticlePaths(
  segment: ArticleSegment,
  slugs: ReadonlyArray<ArticleSlug>,
): string[] {
  return slugs
    .filter((slug) => slug.locale === "ja")
    .map((slug) => `/ja/${segment}/${slug.slug}`);
}
