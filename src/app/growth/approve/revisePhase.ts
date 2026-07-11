/**
 * 構成案修正ループの「修正ステータス → 画面フェーズ」純関数(#43)。
 * クライアント(ApproveClient)が描画分岐・ポーリング判定に使う。Notion 依存なし。
 */

export type RevisePhase = "idle" | "pending" | "ready" | "failed";

/**
 * - pending: 依頼中/処理中(PC待ち・ポーリング対象)
 * - ready  : 提示中(修正案あり・反映/やり直し可能)
 * - failed : 失敗(理由表示・やり直し可能)
 * - idle   : なし/未設定(行コメントで依頼できる)
 */
export function revisePhase(status: string | undefined): RevisePhase {
  if (status === "依頼中" || status === "処理中") return "pending";
  if (status === "提示中") return "ready";
  if (status === "失敗") return "failed";
  return "idle";
}
