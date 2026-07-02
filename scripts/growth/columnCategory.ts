/**
 * growth の `記事タイプ`(articleType) → コラム読者向けカテゴリ content ID の
 * **既定マッピング(多対一)** を解決する純ロジック(#columns P3.5・§6.2)。
 *
 * **このファイルの `ARTICLE_TYPE_TO_CATEGORY` がマッピングの正典(単一の真実源)。**
 * `prompts/drafts.md` の出力スキーマ(payload.category の既定マッピング指示)は
 * この表を転記したもので、乖離は columnCategory.test.ts の乖離検知テストが
 * 検出する(プロンプト側だけ書き換える/削除するとテストが赤になる)。
 *
 * category(読者の回遊/SEO サイロ用)と articleType(内部計測用)は別軸のため
 * (AD8)、AI は articleType から正典6件のうちの既定カテゴリを付与する。
 * これはあくまで既定値で、読者向けの最終分類は承認時 or microCMS で人が調整できる。
 *
 * - 参照値は content ID(安定キー)で書けば十分(column-categories を同 ID で seed 済み)。
 * - 未知/欠落は undefined = category を省略(人が後付け)。
 * - 日本語ラベル(獲得 等)と内部ID(acquire 等)の両方を受理する。
 */

/** Notion `記事タイプ` の日本語ラベル(正典5値)。 */
export type ArticleTypeJa = "獲得" | "不安解消" | "資産" | "比較" | "イベント";

/** マッピング先の column-categories content ID(正典6件のうち既定付与対象)。 */
export type MappedColumnCategoryId = "start" | "rules" | "compare" | "event";

/**
 * 記事タイプ → category content ID の正典マッピング表(多対一・§6.2)。
 * ここが単一の真実源。変更時は `prompts/drafts.md` の転記も併せて更新する
 * (乖離検知テストが強制する)。
 */
export const ARTICLE_TYPE_TO_CATEGORY: Readonly<
  Record<ArticleTypeJa, MappedColumnCategoryId>
> = {
  獲得: "start",
  不安解消: "start",
  資産: "rules",
  比較: "compare",
  イベント: "event",
};

/** 日本語ラベル → articleType 内部ID(schema transform 済みの値)。 */
const JA_TO_INTERNAL_ID: Readonly<Record<ArticleTypeJa, string>> = {
  獲得: "acquire",
  不安解消: "relief",
  資産: "asset",
  比較: "compare",
  イベント: "event",
};

const LABEL_LOOKUP = new Map<string, MappedColumnCategoryId>(
  Object.entries(ARTICLE_TYPE_TO_CATEGORY),
);

// 内部ID 用の索引は正典表から導出する(二重管理しない)。
const INTERNAL_ID_LOOKUP = new Map<string, MappedColumnCategoryId>(
  (Object.keys(ARTICLE_TYPE_TO_CATEGORY) as ArticleTypeJa[]).map((ja) => [
    JA_TO_INTERNAL_ID[ja],
    ARTICLE_TYPE_TO_CATEGORY[ja],
  ]),
);

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
  return LABEL_LOOKUP.get(key) ?? INTERNAL_ID_LOOKUP.get(key);
}
