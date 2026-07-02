/**
 * コラム(microCMS `columns`)の定数。
 *
 * 読者向けカテゴリは **CMS の `column-categories` マスタが単一ソース**(動的・編集者管理)で、
 * ここには焼き込まない(#columns AD7/AD9)。このファイルが持つのは:
 *  - `articleType`(固定セレクト・内部計測軸): Notion `記事タイプ` のミラー(#columns AD8)。
 *  - フロントの一覧ページサイズ・カテゴリ未設定時の既定チップ色。
 *
 * 正典6カテゴリ(start/rules/improve/health/compare/event)の content ID・表示名・色は
 * 設計書 §4.2 に定義し、seed(CMS)と growth の articleType→category マッピング
 * (`scripts/growth/columnCategory.ts`)で参照する。表示は CMS 値を正とするため、
 * このファイルには複製しない。
 */

/** コラム記事タイプ(内部計測軸)。ラベルは microCMS/Notion と同じ日本語運用。 */
export const COLUMN_ARTICLE_TYPES = [
  { id: "acquire", labelJa: "獲得" },
  { id: "relief", labelJa: "不安解消" },
  { id: "asset", labelJa: "資産" },
  { id: "compare", labelJa: "比較" },
  { id: "event", labelJa: "イベント" },
] as const;

export type ColumnArticleTypeId = (typeof COLUMN_ARTICLE_TYPES)[number]["id"];

/** 一覧の1ページ表示件数(news と同数)。 */
export const COLUMN_PAGE_SIZE = 12;

/**
 * カテゴリの `color` が未設定(CMS で空)のときにフロントが使う既定チップ色。
 * ブランドの二次テキスト色。断定的な色を焼き込まないための中立トーン。
 */
export const COLUMN_CATEGORY_FALLBACK_COLOR = "#8A8A8A";
