/**
 * 承認画面のナビ(5 view)ルーティングの純ロジック(#proto P1)。DOM/IO 非依存。
 * proto MainView 語彙へ統一(施策/記事/プロンプト/成績/公開キュー)。旧 proposals|articles|prompts は廃止。
 */

export type ApproveView = "proposal" | "approve" | "prompt" | "performance" | "queue";

export const APPROVE_VIEWS: readonly ApproveView[] = [
  "proposal",
  "approve",
  "prompt",
  "performance",
  "queue",
];

/** `?view` の生値を ApproveView に正規化する。未知/欠落は null。 */
export function parseView(raw: string | null | undefined): ApproveView | null {
  return APPROVE_VIEWS.includes(raw as ApproveView) ? (raw as ApproveView) : null;
}

/**
 * 初期表示 view を決める(proto 既定着地)。
 * 1. URL の view が妥当ならそれを使う。
 * 2. 施策に未処理があれば施策。
 * 3. あなた待ち(記事 actionable)があれば記事。
 * 4. どちらも無ければ成績。
 */
export function decideInitialView(
  param: string | null | undefined,
  counts: { proposalPending: number; awaiting: number },
): ApproveView {
  const parsed = parseView(param);
  if (parsed) return parsed;
  if (counts.proposalPending > 0) return "proposal";
  if (counts.awaiting > 0) return "approve";
  return "performance";
}
