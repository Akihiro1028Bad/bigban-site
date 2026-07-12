import { growthArticleSegment, type GrowthMedia } from "./endpoint";
import { buildKnownArticlePaths, type ArticleSlug } from "./knownPaths";

interface KnownArticlePathDeps {
  getColumnSlugs: () => Promise<ReadonlyArray<ArticleSlug>>;
  getNewsSlugs: () => Promise<ReadonlyArray<ArticleSlug>>;
}

/**
 * 媒体軸に応じて microCMS の公開 slug を取得し、壊れ内部リンク検査用の既知パスへ変換する。
 * slug 取得そのものは呼び出し側の deps に注入し、パス組み立ては buildKnownArticlePaths に集約する。
 */
export async function knownArticlePathsForMedia(
  media: GrowthMedia,
  deps: KnownArticlePathDeps,
): Promise<string[]> {
  const segment = growthArticleSegment(media);
  const slugs =
    segment === "columns" ? await deps.getColumnSlugs() : await deps.getNewsSlugs();
  return buildKnownArticlePaths(segment, slugs);
}
