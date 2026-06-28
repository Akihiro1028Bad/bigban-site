/**
 * 承認画面のタブ(施策/記事)ルーティングの純ロジック(#119)。DOM/IO 非依存。
 *
 * - `?view=proposals|articles` の解釈
 * - 初期表示タブの決定(URL 指定 > 未処理がある方 > 既定=施策)
 */

// "prompts" は各フェーズのプロンプト/前提情報を確認する read-only タブ(未処理という概念はない)。
export type ApproveView = "proposals" | "articles" | "prompts";

export const APPROVE_VIEWS: readonly ApproveView[] = ["proposals", "articles", "prompts"];

/** `?view` の生値を ApproveView に正規化する。未知/欠落は null。 */
export function parseView(raw: string | null | undefined): ApproveView | null {
  return raw === "proposals" || raw === "articles" || raw === "prompts" ? raw : null;
}

/**
 * 初期表示タブを決める。
 * 1. URL の view が妥当ならそれを使う。
 * 2. 施策に未処理があれば施策(両方あっても施策を優先＝ファネル入口)。
 * 3. 記事に未処理があれば記事。
 * 4. どちらも無ければ既定で施策。
 */
export function decideInitialView(
  param: string | null | undefined,
  counts: { proposals: number; articles: number },
): ApproveView {
  const parsed = parseView(param);
  if (parsed) return parsed;
  if (counts.proposals > 0) return "proposals";
  if (counts.articles > 0) return "articles";
  return "proposals";
}
