/**
 * アプリ(承認ページ / API ルート)から growth のコラムカテゴリ既定マッピングを
 * 参照するための再エクスポート。
 *
 * 実装は scripts/growth 側に集約し(headless CLI と共有)、ここでは
 * `@/lib/growth/columnCategory` で import できるよう薄く束ねるだけにする。
 */

export { columnCategoryIdForArticleType } from "../../../scripts/growth/columnCategory";
