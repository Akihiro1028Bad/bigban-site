// 記事の日次ウォッチ CLI(読み取り専用)。設計: docs/superpowers/specs/2026-09-14-article-daily-watch-design.md
// 使い方:
//   node scripts/analytics/watchArticles.mjs --json                 # 日次ウォッチ用(alerts を読む)
//   node scripts/analytics/watchArticles.mjs                        # 人が読む要約
//   オプション: --site <origin>(既定 https://www.thepicklebang.com) / --retry-wait-ms <n>(既定 30000)
// 取得は GA4(記事の入口セッション)・本番 sitemap・記事 HTML のみ。何にも書き込まない。
// sources のいずれかが取得不可なら JSON を出したうえで終了コード1(共通契約: 失敗を 0 にしない)。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ARTICLE_URL, buildArticle, buildArticleWindows, buildReport, computeWindows, extractArticleUrls, formatReport, THRESHOLDS } from "./articleWatch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_SITE = "https://www.thepicklebang.com";
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 5;

function loadEnv() {
  // ローカルは .env.local を正、クラウド(ルーチン実行)は process.env(env secrets)へフォールバック。query.mjs と同じ。
  let fileEnv = {};
  try {
    const text = readFileSync(join(ROOT, ".env.local"), "utf8");
    fileEnv = Object.fromEntries(
      text.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    // .env.local なし(クラウド実行)。
  }
  return { ...process.env, ...fileEnv };
}

function parseArgs(argv) {
  // 同じオプションが複数あれば後勝ち(テストが既定値の後ろに上書きを足せるようにする)。
  const json = argv.includes("--json");
  const siteIndex = argv.lastIndexOf("--site");
  const site = siteIndex >= 0 ? argv[siteIndex + 1] : DEFAULT_SITE;
  if (!/^https?:\/\/[^/]+$/.test(site ?? "")) throw new Error("--site はパスを含まないオリジン(例: https://www.thepicklebang.com)を指定してください");
  const waitIndex = argv.lastIndexOf("--retry-wait-ms");
  const retryWaitMs = waitIndex >= 0 ? Number(argv[waitIndex + 1]) : 30_000;
  if (!Number.isInteger(retryWaitMs) || retryWaitMs < 0) throw new Error("--retry-wait-ms は 0 以上の整数で指定してください");
  return { json, site, retryWaitMs };
}

/** JST の今日(YYYY-MM-DD)。query.mjs の nowInJst と同じ基準。 */
function todayInJst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function accessToken(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: new URLSearchParams({
      client_id: env.GROWTH_GOOGLE_CLIENT_ID,
      client_secret: env.GROWTH_GOOGLE_CLIENT_SECRET,
      refresh_token: env.GROWTH_GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth 失敗: ${res.status}`);
  return (await res.json()).access_token;
}

/** GA4: 記事の入口セッションを日次で取る。失敗は null と理由で返す。 */
async function fetchEntryRows(env, windows) {
  try {
    const token = await accessToken(env);
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${env.GROWTH_GA4_PROPERTY_ID}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        dateRanges: [windows.fetch],
        dimensions: [{ name: "landingPagePlusQueryString" }, { name: "date" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          orGroup: {
            expressions: [
              { filter: { fieldName: "landingPagePlusQueryString", stringFilter: { matchType: "CONTAINS", value: "/columns/" } } },
              { filter: { fieldName: "landingPagePlusQueryString", stringFilter: { matchType: "CONTAINS", value: "/news/" } } },
            ],
          },
        },
        limit: 10000,
      }),
    });
    if (!res.ok) return { rows: null, error: `GA4 HTTP ${res.status}` };
    const report = await res.json();
    const rows = (report.rows ?? []).map((r) => ({ landingPage: r.dimensionValues[0].value, date: r.dimensionValues[1].value, sessions: Number(r.metricValues[0].value) }));
    return { rows, error: null };
  } catch (e) {
    return { rows: null, error: `GA4 取得失敗: ${e.message}` };
  }
}

async function fetchSitemap(site) {
  try {
    const res = await fetch(`${site}/sitemap.xml`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { xml: null, error: `sitemap HTTP ${res.status}` };
    return { xml: await res.text(), error: null };
  } catch (e) {
    return { xml: null, error: `sitemap 取得失敗: ${e.message}` };
  }
}

/** 記事ページを取る。200 以外・接続不能は retryWaitMs 待って1回だけ再試行する(設計書 §4.2)。 */
async function fetchPage(url, retryWaitMs) {
  const attempt = async () => {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
      return res.status === 200 ? { status: 200, observed: "ok", html: await res.text() } : { status: res.status, observed: "error", html: null };
    } catch {
      return { status: null, observed: "unreachable", html: null };
    }
  };
  let result = await attempt();
  let retried = false;
  if (result.observed !== "ok") {
    await new Promise((resolve) => setTimeout(resolve, retryWaitMs));
    result = await attempt();
    retried = true;
  }
  return { ...result, retried };
}

/** 並列数を抑えて順に取る(本番サイトへの同時接続を CONCURRENCY 本まで)。 */
async function fetchPages(site, paths, retryWaitMs) {
  const results = new Array(paths.length);
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const index = next++;
      results[index] = await fetchPage(`${site}${paths[index]}`, retryWaitMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));
  return results;
}

async function main() {
  const { json, site, retryWaitMs } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const today = todayInJst();
  const windows = computeWindows(today);

  const [ga4, sitemap] = await Promise.all([fetchEntryRows(env, windows), fetchSitemap(site)]);
  const entryMap = ga4.rows === null ? null : buildArticleWindows(ga4.rows, windows);
  const { paths, overflow } = sitemap.xml === null ? { paths: [], overflow: [] } : extractArticleUrls(sitemap.xml, site);

  const sitemapErrors = [sitemap.error, overflow.length ? `上限超過で未取得: ${overflow.join(", ")}` : null];
  // sitemap に無いのに流入がある記事(S の対象)。EN は sitemap 未掲載が既知なので黙って除く。
  // 上限超過で未取得の記事(overflow)は sitemap には載っているので「sitemap 外」ではない。
  // 候補はルートに存在する記事 URL の形(ARTICLE_URL)に限る(entryMap のキーは部分一致で入るため)。
  // 1件の誤リンクや bot で鳴らさないよう、流入が sMinSessions 未満の記事は出さない。
  // sitemap を取れなかった日は「sitemap に無い」と言えないので S は出さない。
  const listed = new Set([...paths, ...overflow]);
  const sessions = (e) => e.last7 + e.prev7;
  const unlistedAll = entryMap === null || sitemap.xml === null
    ? []
    : [...entryMap.entries()]
      .filter(([path, e]) => !listed.has(path) && ARTICLE_URL.test(path) && !path.startsWith("/en/") && sessions(e) >= THRESHOLDS.sMinSessions)
      // 上限で切るため、流入の多い順(同数はパス昇順)に並べてから先頭を取る。
      .sort(([pathX, x], [pathY, y]) => sessions(y) - sessions(x) || pathX.localeCompare(pathY))
      .map(([path]) => path);
  const unlisted = unlistedAll.slice(0, THRESHOLDS.maxUnlisted);
  if (unlistedAll.length > THRESHOLDS.maxUnlisted) {
    sitemapErrors.push(`sitemap 外の記事が${THRESHOLDS.maxUnlisted}本を超えたため未確認: ${unlistedAll.slice(THRESHOLDS.maxUnlisted).join(", ")}`);
  }

  // sitemap 外の記事も同じ再試行ルールで取りに行く(生きているか / ソフト404 かを S に添えるため)。
  const watchPaths = [...paths, ...unlisted];
  const pages = await fetchPages(site, watchPaths, retryWaitMs);
  // sources.html は監視対象(sitemap の記事)の取得状況だけを表す。sitemap 外の取得失敗は S 側で表現する。
  const sitemapPages = pages.slice(0, paths.length);
  const htmlErrors = sitemapPages.flatMap((p, i) => (p.observed === "ok" ? [] : [`${p.observed}: ${paths[i]}`]));

  const articles = watchPaths.map((path, i) =>
    buildArticle({
      path,
      entry: entryMap === null ? null : entryMap.get(path) ?? { yesterday: 0, sameWeekdayLastWeek: 0, last7: 0, prev7: 0 },
      http: { status: pages[i].status, retried: pages[i].retried, observed: pages[i].observed },
      html: pages[i].html,
      today,
      inSitemap: i < paths.length,
    }),
  );

  const errorText = (list) => (list.filter(Boolean).length ? list.filter(Boolean).join(" / ") : null);
  const sources = {
    ga4: { ok: ga4.error === null, error: ga4.error },
    sitemap: { ok: sitemap.error === null && overflow.length === 0, count: paths.length, error: errorText(sitemapErrors) },
    html: { ok: htmlErrors.length === 0 && sitemap.error === null, fetched: sitemapPages.filter((p) => p.observed === "ok").length, error: errorText(htmlErrors) },
  };
  const report = buildReport({ today, windows, sources, articles });
  console.log(json ? JSON.stringify(report) : formatReport(report));
  if (!sources.ga4.ok || !sources.sitemap.ok || !sources.html.ok) process.exitCode = 1;
}

// import されても副作用が出ないよう、直接実行時のみ main() を走らせる(query.mjs と同じ)。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`記事ウォッチ失敗: ${e.message}`);
    process.exit(1);
  });
}
