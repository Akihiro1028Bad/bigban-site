/**
 * growth の `記事タイプ`(articleType) → コラム読者向けカテゴリ content ID の
 * **既定マッピング(多対一)** を解決する純ロジック(#columns P3.5・§6.2)。
 *
 * category(読者の回遊/SEO サイロ用)と articleType(内部計測用)は別軸のため
 * (AD8)、AI は articleType から正典6件のうちの既定カテゴリを付与する。
 * これはあくまで既定値で、読者向けの最終分類は承認時 or microCMS で人が調整できる。
 *
 * - 参照値は content ID(安定キー)で書けば十分(column-categories を同 ID で seed 済み)。
 * - 未知/欠落は undefined = category を省略(人が後付け)。
 * - 日本語ラベル(獲得 等)と内部ID(acquire 等)の両方を受理する。
 */

/** Notion 記事タイプの日本語ラベル → category content ID(多対一)。 */
const LABEL_TO_CATEGORY_ID: Readonly<Record<string, string>> = {
  獲得: "start",
  不安解消: "start",
  資産: "rules",
  比較: "compare",
  イベント: "event",
};

/** articleType 内部ID(schema の transform 済み) → category content ID。 */
const ARTICLE_TYPE_ID_TO_CATEGORY_ID: Readonly<Record<string, string>> = {
  acquire: "start",
  relief: "start",
  asset: "rules",
  compare: "compare",
  event: "event",
};

/**
 * 記事タイプからコラムカテゴリの content ID を返す。解決できなければ undefined。
 * @param articleType Notion `記事タイプ` の値(日本語ラベル)または内部ID。
 */
export function columnCategoryIdForArticleType(
  articleType: string | undefined,
): string | undefined {
  if (!articleType) return undefined;
  const key = articleType.trim();
  if (!key) return undefined;
  return LABEL_TO_CATEGORY_ID[key] ?? ARTICLE_TYPE_ID_TO_CATEGORY_ID[key];
}
