/**
 * アプリ(承認ページ API ルート)から growth の公開先エンドポイントを解決するための再エクスポート。
 *
 * 実装は scripts/growth 側に集約し(headless CLI と共有)、ここでは
 * `@/lib/growth/endpoint` で import できるよう薄く束ねるだけにする。
 */

export {
  growthArticleSegment,
  growthEndpoint,
  growthMediaForRow,
  MEDIA_COLUMN_LABEL,
  MEDIA_NEWS_LABEL,
  type ArticleSegment,
  type GrowthMedia,
} from "../../../scripts/growth/endpoint";
