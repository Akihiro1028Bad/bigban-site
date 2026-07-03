/**
 * growth 記事の公開先 microCMS エンドポイント名を決める純ロジック。
 *
 * **媒体軸(#media)**: グロースループは media = `column`(SEO 資産)/ `news`(告知)の
 * 2 媒体を扱う。行(記事ネタ案)の `媒体` プロパティで公開先を出し分ける:
 * - `news`  → 常に `"news"`(env に依らない。告知は必ず news に載る)。
 * - `column`→ 従来どおり env(`GROWTH_MICROCMS_ENDPOINT`)従属。columns 分離(#columns)の
 *   dev 先行検証・本番切替・ロールバックを env だけで済ませる土台。
 *
 * media 省略時は `column`(=従来挙動)にフォールバックするため、既存の `growthEndpoint()` /
 * `growthArticleSegment()` 呼び出しは挙動不変。`GROWTH_MICROCMS_ENDPOINT` は
 * 「**column の公開先**」として再定義される(news はこの値を無視する)。
 *
 * env をテストで差し替えやすいよう、module-level const ではなく関数で提供する。
 * env 未設定・空文字・空白のみは現行互換の `"news"` にフォールバックする(挙動不変)。
 */

/** 参照する環境変数の最小形。テスト注入を容易にするため必要なキーだけ要求する。 */
type EndpointEnv = Readonly<Record<string, string | undefined>>;

/** グロース記事の媒体軸。column=SEO 資産(env 従属) / news=告知(常に news)。 */
export type GrowthMedia = "column" | "news";

/** Notion「記事ネタ案」`媒体` select の値。欠落=コラム(完全後方互換)。 */
const MEDIA_NEWS_LABEL = "ニュース";
const MEDIA_COLUMN_LABEL = "コラム";

/**
 * Notion 行の `媒体` プロパティ値(select 表示名)を media 軸へ解決する。
 * `"ニュース"` → `news`。それ以外(`"コラム"`・未追加・空・未知)は `column`(欠落耐性)。
 * @param value Notion `媒体` select の表示名(未設定なら undefined)。
 */
export function growthMediaForRow(value: string | undefined): GrowthMedia {
  return value?.trim() === MEDIA_NEWS_LABEL ? "news" : "column";
  // MEDIA_COLUMN_LABEL は明示コラム指定の可読な別名(既定と同値)。
}

// 明示コラム指定を人が読めるように export(値としては既定と同じ column)。
export { MEDIA_COLUMN_LABEL, MEDIA_NEWS_LABEL };

/**
 * 公開先エンドポイント名を返す。
 * @param media 媒体軸(既定 `column`=従来挙動)。`news` は env を無視して常に `"news"`。
 * @param env 参照する環境変数(既定は process.env)。テストで注入可能にするための引数。
 */
export function growthEndpoint(
  media: GrowthMedia = "column",
  env: EndpointEnv = process.env,
): string {
  if (media === "news") return "news";
  return env.GROWTH_MICROCMS_ENDPOINT?.trim() || "news";
}

/** URL パスセグメントとして使える公開先(news / columns)。 */
const ARTICLE_SEGMENTS = ["news", "columns"] as const;
export type ArticleSegment = (typeof ARTICLE_SEGMENTS)[number];

/**
 * 公開記事の URL パスセグメント(`/ja/<segment>/<slug>` の <segment>)を返す。
 *
 * `growthEndpoint()` の値(news / columns)がそのまま URL セグメントになるが、
 * 未知の endpoint 値が URL やリンク検査に漏れると壊れた導線を生むため、
 * 既知の news / columns 以外は現行互換の `"news"` に丸める(欠落耐性)。
 * media 省略時は column 扱い=挙動不変。news は常に `"news"`。
 */
export function growthArticleSegment(
  media: GrowthMedia = "column",
  env: EndpointEnv = process.env,
): ArticleSegment {
  const endpoint = growthEndpoint(media, env);
  return (ARTICLE_SEGMENTS as ReadonlyArray<string>).includes(endpoint)
    ? (endpoint as ArticleSegment)
    : "news";
}
