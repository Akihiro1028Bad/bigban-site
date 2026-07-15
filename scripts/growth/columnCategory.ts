/**
 * growth の `記事タイプ`(articleType) → コラム読者向けカテゴリ content ID の
 * **既定マッピング(多対一)** を解決する純ロジック(#columns P3.5・§6.2)。
 *
 * **このファイルの `ARTICLE_TYPE_TO_CATEGORY` がマッピングの正典(単一の真実源)。**
 * 下書きオーケストレーターのpayload.category解決は
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
 * ここが単一の真実源。下書きオーケストレーターはこの関数を直接呼び出す
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

/**
 * #222: category の**優先順位を単一ソースで解決**する純ロジック。
 * Notion 任意プロパティ `コラムカテゴリ`(人が上書き)が既定マッピングより優先。
 *
 * - `override`(=Notion `コラムカテゴリ` select の値)が正典6件のいずれかなら**それを最優先で採用**。
 * - override が空/未追加(欠落耐性)なら articleType からの既定マッピングにフォールバック。
 * - どちらでも解決できなければ undefined(= category 省略・人が microCMS で後付け)。
 *
 * category(読者向け・回遊/SEO)と articleType(内部計測)は別軸で共存する(AD8)。
 * override は読者向けの最終分類を人が動的に決める手段(columns AD7)であり、
 * 内部計測軸である `記事タイプ` は上書きしない(両軸は独立)。
 */
export function resolveColumnCategoryId(
  articleType: string | undefined,
  override: string | undefined,
): string | undefined {
  const overrideKey = override?.trim();
  if (overrideKey && isColumnCategoryId(overrideKey)) return overrideKey;
  return columnCategoryIdForArticleType(articleType);
}

/** 承認/microCMS で選べる column-categories の正典 content ID(6件・AD7 の動的カテゴリ)。 */
export const COLUMN_CATEGORY_IDS = [
  "start",
  "rules",
  "improve",
  "health",
  "compare",
  "event",
] as const;
export type ColumnCategoryId = (typeof COLUMN_CATEGORY_IDS)[number];

const COLUMN_CATEGORY_ID_SET = new Set<string>(COLUMN_CATEGORY_IDS);

/** 与えられた文字列が正典 content ID のいずれかか(override の妥当性判定)。 */
export function isColumnCategoryId(value: string): value is ColumnCategoryId {
  return COLUMN_CATEGORY_ID_SET.has(value);
}
