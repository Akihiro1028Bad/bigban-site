/**
 * growth 記事の公開先 microCMS エンドポイント名を決める純ロジック。
 *
 * これまで各 CLI / API ルートで `const ENDPOINT = "news"` とハードコードしていた
 * 公開先を 1 箇所へ集約する(#columns P1)。dev で `columns` を先行検証し、本番切替や
 * ロールバックを env(`GROWTH_MICROCMS_ENDPOINT`)の切替だけで済ませるための土台。
 *
 * env をテストで差し替えやすいよう、module-level const ではなく関数で提供する。
 * env 未設定・空文字・空白のみは現行互換の `"news"` にフォールバックする(挙動不変)。
 */

/** 参照する環境変数の最小形。テスト注入を容易にするため必要なキーだけ要求する。 */
type EndpointEnv = Readonly<Record<string, string | undefined>>;

/**
 * 公開先エンドポイント名を返す。
 * @param env 参照する環境変数(既定は process.env)。テストで注入可能にするための引数。
 */
export function growthEndpoint(env: EndpointEnv = process.env): string {
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
 * env 未設定時は `"news"` = 挙動不変。
 */
export function growthArticleSegment(env: EndpointEnv = process.env): ArticleSegment {
  const endpoint = growthEndpoint(env);
  return (ARTICLE_SEGMENTS as ReadonlyArray<string>).includes(endpoint)
    ? (endpoint as ArticleSegment)
    : "news";
}
