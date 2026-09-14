// 記事の日次ウォッチ(設計: docs/superpowers/specs/2026-09-14-article-daily-watch-design.md)の純ロジック。
// fetch を含む I/O は watchArticles.mjs に置き、ここは入力→出力の変換だけを持つ(テスト対象)。
import { isArticlePath, normalizeArticlePath } from "./articleMetrics.mjs";

/** 設計書 §3 の閾値。変えるときは設計書を先に直す。 */
export const THRESHOLDS = {
  g1MinPrev7: 30,
  g1Percent: 40,
  g2MinPrev: 20,
  g2Percent: 60,
  g3MinPrev7: 30,
  newArticleDays: 14,
  h2StaleDays: 14,
  maxArticles: 50,
};

const DAY_MS = 86_400_000;

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/** JST の今日を起点に、判定に使う4窓と GA4 の取得窓(前7日の初日〜昨日)を作る。 */
export function computeWindows(today) {
  const yesterday = addDays(today, -1);
  const sameWeekday = addDays(today, -8);
  return {
    yesterday: { startDate: yesterday, endDate: yesterday },
    sameWeekdayLastWeek: { startDate: sameWeekday, endDate: sameWeekday },
    last7: { startDate: addDays(today, -7), endDate: yesterday },
    prev7: { startDate: addDays(today, -14), endDate: sameWeekday },
    fetch: { startDate: addDays(today, -14), endDate: yesterday },
  };
}

/** 既定ロケールの "/ja" 接頭辞。ja 記事は接頭辞あり/なしの両方で入口が記録されるため揃える。 */
const JA_PREFIX = /^\/ja(?=\/)/;

/** GA4 の入口パスを、記事を一意に指すキーに揃える(オリジン・クエリ・末尾スラッシュ・/ja 接頭辞を落とす)。 */
const toArticleKey = (landingPage) => normalizeArticlePath(landingPage).replace(JA_PREFIX, "");

const inRange = (iso, range) => iso >= range.startDate && iso <= range.endDate;
const WINDOW_KEYS = ["yesterday", "sameWeekdayLastWeek", "last7", "prev7"];

/** GA4 の landingPage × date 行を、記事パスごとの4窓セッション数に畳む。 */
export function buildArticleWindows(rows, windows) {
  const result = new Map();
  for (const { landingPage, date, sessions } of rows) {
    const path = toArticleKey(landingPage);
    if (!isArticlePath(path)) continue;
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const entry = result.get(path) ?? { yesterday: 0, sameWeekdayLastWeek: 0, last7: 0, prev7: 0 };
    for (const key of WINDOW_KEYS) if (inRange(iso, windows[key])) entry[key] += sessions;
    result.set(path, entry);
  }
  return result;
}
