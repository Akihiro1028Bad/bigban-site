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

const pct = (cur, prev) => ((cur - prev) / prev) * 100;

/** 設計書 §3.1。公開14日未満は対象外。null の値を使う判定はその判定だけ飛ばす。 */
export function detectEntryFlags(entry, publishedAt, today) {
  if (!entry) return [];
  if (publishedAt && daysBetween(publishedAt, today) < THRESHOLDS.newArticleDays) return [];
  const flags = [];
  const { yesterday, sameWeekdayLastWeek, last7, prev7 } = entry;
  if (last7 !== null && prev7 !== null && prev7 >= THRESHOLDS.g3MinPrev7 && last7 === 0) {
    flags.push({ code: "G3", severity: "高", detail: { last7, prev7 } });
  } else if (last7 !== null && prev7 !== null && prev7 >= THRESHOLDS.g1MinPrev7 && Math.abs(pct(last7, prev7)) > THRESHOLDS.g1Percent) {
    flags.push({ code: "G1", severity: "中", detail: { last7, prev7, deltaPercent: Math.round(pct(last7, prev7)) } });
  }
  if (
    yesterday !== null && sameWeekdayLastWeek !== null &&
    sameWeekdayLastWeek >= THRESHOLDS.g2MinPrev && Math.abs(pct(yesterday, sameWeekdayLastWeek)) > THRESHOLDS.g2Percent
  ) {
    flags.push({ code: "G2", severity: "中", detail: { yesterday, sameWeekdayLastWeek, deltaPercent: Math.round(pct(yesterday, sameWeekdayLastWeek)) } });
  }
  return flags;
}

const ARTICLE_URL = /^\/(?:en\/)?(?:columns|news)\/[^/]+$/;

/** sitemap から記事詳細のパスを拾う(一覧ページ・別オリジンは除外。上限は設計書 §4.2)。 */
export function extractArticleUrls(xml, origin) {
  const paths = [];
  for (const [, url] of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    if (!url.startsWith(origin)) continue;
    const path = url.slice(origin.length).replace(/\/$/, "");
    if (ARTICLE_URL.test(path) && !paths.includes(path)) paths.push(path);
  }
  return { paths: paths.slice(0, THRESHOLDS.maxArticles), overflow: paths.slice(THRESHOLDS.maxArticles) };
}

const JST_OFFSET_MS = 9 * 3_600_000;

function toJstDate(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function stripTags(fragment) {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 設計書 §3.2・§7④。Article / NewsArticle の JSON-LD から日付を、<main>(無ければ <article>、無ければ body 全体)から本文を取る。 */
export function parseArticleHtml(html) {
  let datePublished = null;
  let dateModified = null;
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      continue;
    }
    if (data["@type"] === "Article" || data["@type"] === "NewsArticle") {
      datePublished = toJstDate(data.datePublished);
      dateModified = toJstDate(data.dateModified);
      break;
    }
  }
  const main = html.match(/<main[\s>][\s\S]*?<\/main>/);
  const article = main ? null : html.match(/<article[\s>][\s\S]*?<\/article>/);
  const scope = main ? "main" : article ? "article" : "body";
  const mainText = stripTags((main ?? article)?.[0] ?? html);
  return { datePublished, dateModified, mainText, scope };
}

const H1_PHRASES = ["募集中", "受付中", "開催します", "開催予定"];
const H2_PHRASES = ["まもなく", "近日公開", "近日中", "追って"];
const NEWS_PATH = /^\/(?:en\/)?news\//;
const FULL_DATE = /(\d{4})年(\d{1,2})月(\d{1,2})日/g;

/** 設計書 §3.2。H1 はニュースのみ。年のない日付は使わない。dateModified が無い H2 は判定しない。 */
export function detectTextFlags(path, parsed, today) {
  if (!parsed) return [];
  const flags = [];
  const text = parsed.mainText;
  if (NEWS_PATH.test(path)) {
    const phrase = H1_PHRASES.find((p) => text.includes(p));
    const dates = [...text.matchAll(FULL_DATE)].map(([, y, m, d]) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`).sort();
    const eventDate = dates.at(-1);
    if (phrase && eventDate && eventDate < today) flags.push({ code: "H1", severity: "中", detail: { phrase, eventDate } });
  }
  const pending = H2_PHRASES.find((p) => text.includes(p));
  if (pending && parsed.dateModified) {
    const daysSinceModified = daysBetween(parsed.dateModified, today);
    if (daysSinceModified > THRESHOLDS.h2StaleDays) {
      flags.push({ code: "H2", severity: "低", detail: { phrase: pending, dateModified: parsed.dateModified, daysSinceModified } });
    }
  }
  return flags;
}

/** 設計書 §3.3。再試行後も 200 以外が続いた場合だけ。接続不能(unreachable)は観測不能として付けない。 */
export function detectHttpFlag(http) {
  return http.observed === "error" ? { code: "I", severity: "最優先", detail: { status: http.status } } : null;
}
