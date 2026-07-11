/**
 * 盤ポーリングの健全性表示の純ロジック(#H5 / QA-05)。DOM 非依存。
 *
 * ポーリング失敗を握り潰すと「古いデータを最新のように」見せてしまう。連続失敗が閾値を超えたら
 * 「最新化できていません（最終更新 hh:mm）」と控えめに可視化する(沈黙させない)。
 */

/** この回数以上連続で失敗したら警告を出す。 */
export const POLL_FAIL_THRESHOLD = 2;

/** 連続失敗が閾値以上なら true(警告表示)。 */
export function shouldWarnPollStale(failures: number, threshold: number = POLL_FAIL_THRESHOLD): boolean {
  return failures >= threshold;
}

/** 最終更新時刻の hh:mm 表記(ローカル時刻)。未取得(null)は「—」。 */
export function formatLastUpdated(ms: number | null): string {
  if (ms === null) return "—";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
