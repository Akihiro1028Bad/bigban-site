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
