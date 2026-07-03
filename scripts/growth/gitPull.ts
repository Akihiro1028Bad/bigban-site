/**
 * 実行前 git pull(ff-only)の純ロジック(#219 / P1⑤)。プロセス spawn は run.mjs 側。
 *
 * 自宅 PC の headless 実行が「旧版のまま走り続ける」のを防ぐため、各モード起動**前**に
 * `git pull --ff-only` を行う。ここでは pull を skip すべきか・結果が成功か・失敗通知文を
 * どう組み立てるか、といった判定だけを持つ(IO 非依存でテスト可能)。
 *
 * 失敗(非 ff・conflict・ネットワーク断)は「沈黙させない」原則に従い、工程を中断して
 * 工程名・再開コマンド・原因ヒントを LINE 通知する(組み立てはここ、送信は run.mjs)。
 */

/** GROWTH_DRYRUN / GROWTH_SKIP_PULL のいずれかが立っていれば pull を skip する(動作確認を壊さない)。 */
export function shouldSkipPull(env: Record<string, string | undefined>): boolean {
  return Boolean(env.GROWTH_DRYRUN) || Boolean(env.GROWTH_SKIP_PULL);
}

/** pull の子プロセス終了コード → 成否。null(シグナル等)や非 0 は失敗。 */
export function classifyPullResult(exitCode: number | null): { ok: boolean } {
  return { ok: exitCode === 0 };
}

export interface PullFailureInput {
  /** 実行モード(工程名)。 */
  mode: string;
  /** pull 対象ブランチ。 */
  branch: string;
  /** 再開コマンド(この工程をやり直すためのコマンド)。 */
  resumeCommand: string;
  /** git の stderr 抜粋(原因特定の手掛かり)。空なら省略。 */
  detail?: string;
}

/**
 * pull 失敗時の LINE 本文。工程名・対象ブランチ・再開コマンドを必ず載せ、
 * detail があれば原因ヒントとして末尾に付ける(沈黙させない=#24 と整合)。
 */
export function buildPullFailureMessage(input: PullFailureInput): string {
  const lines = [
    `❌ グロース実行前の git pull --ff-only に失敗しました(${input.mode})。`,
    "旧版のまま走り続けるのを防ぐため、この工程は中断しました。",
    `対象ブランチ: ${input.branch}`,
    "手動で最新化してから再実行してください:",
    `  git pull --ff-only`,
    `再開コマンド: ${input.resumeCommand}`,
  ];
  const detail = input.detail?.trim();
  if (detail) lines.push(`詳細: ${detail}`);
  return lines.join("\n");
}

/** 実行時 SHA を通知に載せる行(デプロイ側 SHA とのスキュー確認用)。空なら取得失敗を明示。 */
export function formatShaLine(shortSha: string): string {
  const sha = shortSha.trim();
  return sha ? `実行 SHA: ${sha}` : "実行 SHA: (取得できませんでした)";
}
