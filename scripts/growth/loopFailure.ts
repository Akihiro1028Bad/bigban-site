/**
 * loop/実行モードの claude 起動失敗・非0 exit を LINE 通知するための本文組み立て(#220 / P1⑥)。
 *
 * これまで LINE 通知は weekly のみで、revise/advise/decorate 等の pull 型ループや
 * drafts/initiatives は `child.on("error")` が stderr 止まりだった。claude 未起動
 * (サブスク切れ・PATH 崩れ)や異常終了だと reap も next も回らず、依頼が黙って
 * 拾われなくなる。ここでは本文だけを組み立て(送信は run.mjs → notify CLI)、
 * 「失敗を沈黙させない」を weekly と同水準にそろえる。
 */

export type LoopFailureKind = "spawn-error" | "nonzero-exit";

export interface LoopFailureInput {
  /** 実行モード(工程名)。 */
  mode: string;
  /** 再開コマンド。 */
  resumeCommand: string;
  /** 失敗の種別。 */
  kind: LoopFailureKind;
  /** 非0 exit の終了コード(nonzero-exit のとき)。 */
  exitCode?: number;
  /** 原因の手掛かり(spawn エラーメッセージ等)。空なら省略。 */
  detail?: string;
}

/** loop/実行モードの失敗 LINE 本文。工程名・原因・再開コマンドを必ず載せる。 */
export function buildLoopFailureMessage(input: LoopFailureInput): string {
  const head =
    input.kind === "spawn-error"
      ? `❌ グロース ${input.mode} の claude を起動できませんでした。`
      : `❌ グロース ${input.mode} が異常終了しました(exit ${input.exitCode ?? "?"})。`;
  const lines = [
    head,
    "この工程が回らないと reap / 次の依頼処理が止まります。PATH / サブスクを確認してください。",
    `再開コマンド: ${input.resumeCommand}`,
  ];
  const detail = input.detail?.trim();
  if (detail) lines.push(`詳細: ${detail}`);
  return lines.join("\n");
}
