/**
 * child_process の exit code をプロセス終了コードへ正規化する。
 * シグナル終了時は code=null になるため、成功ではなく失敗として扱う。
 *
 * @param {number | null} code
 * @returns {number}
 */
export function exitCodeOrFailure(code) {
  return code ?? 1;
}
