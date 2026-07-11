// peek CLI の結果から loop を実行すべきか判定する。
// run.mjs は TypeScript を import できないため、同じ判定をミラーしている。
//
// フェイルオープン: 判定できないときは true(実依頼の取りこぼしを防ぐため走らせる)。
// peek は件数を数値1行で出すが、`npm run` 経由だとバナー等が前置されることがあるため、
// **最後の非空行**を件数として解釈する(バナー混入に強くする)。
export function shouldRunLoop(peekStdout: string, peekExitCode: number | null): boolean {
  if (peekExitCode !== 0) return true;
  const lines = peekStdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const last = lines[lines.length - 1];
  if (last === undefined || !/^\d+$/.test(last)) return true;
  return Number(last) > 0;
}
