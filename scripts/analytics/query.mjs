// 対話型分析セッション用の一括集計スクリプト(読み取り専用)
// 使い方:
//   node scripts/analytics/query.mjs            # 週次(直近7日 vs 前7日)
//   node scripts/analytics/query.mjs --days 28  # 月初(直近28日 vs 前28日 + SEO詳細)
// 出力は集計値のみ。書き込みは一切しない。
// 運用手順: docs/operations/interactive-analysis-runbook.md
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildArticleRows,
  formatArticleRow,
  formatDelta as fmtDelta,
  isBrandQuery,
  sumEntrySessions,
} from "./articleMetrics.mjs";
import { CTA_EVENTS } from "./ctaEvents.mjs";
import { collectMonitoring, formatMonitoring } from "./monitoring.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadEnv() {
  // ローカルは .env.local を正、クラウド(ルーチン実行)は .env.local が無いため
  // process.env(claude.ai の env secrets)へフォールバックする。
  let fileEnv = {};
  try {
    const text = readFileSync(join(ROOT, ".env.local"), "utf8");
    fileEnv = Object.fromEntries(
      text
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
    );
  } catch {
    // .env.local なし(クラウド実行)。process.env だけで動かす。
  }
  return { ...process.env, ...fileEnv };
}

function parseArgs(argv) {
  const i = argv.indexOf("--days");
  const days = i >= 0 ? Number(argv[i + 1]) : 7;
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("--days は 1〜90 の整数で指定してください");
  }
  // 前期を「直前のN日」ではなく「K日前にずらした同幅」にする(K>=N)。
  // 例: --days 1 --prev-offset 7 で「昨日 vs 前週同曜日」。日次ウォッチの誤報防止用。
  const j = argv.indexOf("--prev-offset");
  const prevOffset = j >= 0 ? Number(argv[j + 1]) : days;
  if (!Number.isInteger(prevOffset) || prevOffset < days || prevOffset > 90) {
    throw new Error("--prev-offset は days 以上 90 以下の整数で指定してください");
  }
  const monitorOnly = argv.includes("--monitor-only");
  const json = argv.includes("--json");
  if (json && !monitorOnly) throw new Error("--json は --monitor-only と併用してください");
  return { days, prevOffset, monitorOnly, json };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** JST(UTC+9)のカレンダー日付を表す Date を返す(以降 getUTC 系と isoDate が JST の日付を読む) */
function nowInJst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

/**
 * JST の前日を終端に、今期・前期の日付レンジを作る。
 * GA4/GSC は当日データが不完全なため終端は前日。
 * 基準を JST に揃えるのは、朝の実行時刻(JST 08-09時 = UTC 前日 23-24時)に
 * UTC 基準だと「一昨日」を見てしまうため(2026-08-06 日次ウォッチが検出)。
 */
function ranges(days, prevOffset = days) {
  const end = nowInJst();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - prevOffset);
  const prevEnd = new Date(end);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - prevOffset);
  return {
    cur: { startDate: isoDate(start), endDate: isoDate(end) },
    prv: { startDate: isoDate(prevStart), endDate: isoDate(prevEnd) },
  };
}

async function accessToken(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(15000),
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

/** GA4 の記事系ページを絞り込む OR フィルタ(pagePath が columns / news を含む)。 */
const ARTICLE_PAGE_FILTER = {
  orGroup: {
    expressions: [
      { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "/columns/" } } },
      { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "/news/" } } },
    ],
  },
};

/** GA4 レポートの行を Map(ディメンション値 → メトリクス値)に畳む。 */
function rowsToMap(report, { dimensionIndex = 0, metricIndex = 0 } = {}) {
  const result = new Map();
  for (const row of report.rows ?? []) {
    const key = row.dimensionValues[dimensionIndex].value;
    result.set(key, (result.get(key) ?? 0) + +row.metricValues[metricIndex].value);
  }
  return result;
}

async function main() {
  const { days, prevOffset, monitorOnly, json } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const token = await accessToken(env);
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const { cur, prv } = ranges(days, prevOffset);
  const isMonthly = days >= 28;

  if (monitorOnly) {
    const report = await collectMonitoring({ token, propertyId: env.GROWTH_GA4_PROPERTY_ID, cur, prv });
    console.log(json ? JSON.stringify(report) : formatMonitoring(report));
    if (report.metrics.some((metric) => metric.current === null || metric.previous === null)) process.exitCode = 1;
    return;
  }

  const ga4 = async (body) => {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${env.GROWTH_GA4_PROPERTY_ID}:runReport`,
      { method: "POST", headers: auth, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) throw new Error(`GA4 失敗: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  const gsc = async (body) => {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GROWTH_GSC_SITE_URL)}/searchAnalytics/query`,
      { method: "POST", headers: auth, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) throw new Error(`GSC 失敗: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };

  console.log(`# 分析スナップショット (${cur.startDate}〜${cur.endDate} / 前期 ${prv.startDate}〜${prv.endDate})`);

  // 日次監視は上位ページや任意レポートの成否に依存させない。
  const monitoring = await collectMonitoring({ token, propertyId: env.GROWTH_GA4_PROPERTY_ID, cur, prv });
  console.log("\n## GA4 監視対象・CTAイベント(今期・前期の直接比較)");
  console.log(formatMonitoring(monitoring));

  // --- GA4: ページ別PV(前期比) ---
  const [pages, pagesPrev] = await Promise.all(
    [cur, prv].map((d) =>
      ga4({
        dateRanges: [d],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 30,
      })
    )
  );
  const prevPv = new Map((pagesPrev.rows ?? []).map((r) => [r.dimensionValues[0].value, +r.metricValues[0].value]));
  console.log("\n## GA4 ページ別PV(上位・前期比)");
  for (const r of (pages.rows ?? []).slice(0, isMonthly ? 15 : 10)) {
    const p = r.dimensionValues[0].value;
    const pv = +r.metricValues[0].value;
    console.log(`${p}  PV=${pv} (${fmtDelta(pv, prevPv.get(p) ?? 0)})  Users=${r.metricValues[1].value}`);
  }

  // --- GA4: チャネル別(前期比) ---
  const [ch, chPrev] = await Promise.all(
    [cur, prv].map((d) =>
      ga4({
        dateRanges: [d],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      })
    )
  );
  const prevCh = new Map((chPrev.rows ?? []).map((r) => [r.dimensionValues[0].value, +r.metricValues[0].value]));
  console.log("\n## GA4 チャネル別セッション(前期比)");
  for (const r of ch.rows ?? []) {
    const k = r.dimensionValues[0].value;
    const s = +r.metricValues[0].value;
    console.log(`${k}  ${s} (${fmtDelta(s, prevCh.get(k) ?? 0)})`);
  }

  // --- GA4: CTA設置箇所別(customEvent:location) ---
  // どのCTAが効いているかを設置箇所の粒度で見る。"(not set)" は gtag 初期化前のクリック等で
  // 発生するが規模の把握に必要なのでそのまま出す。
  const evLoc = await ga4({
    dateRanges: [cur],
    dimensions: [{ name: "eventName" }, { name: "customEvent:location" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: CTA_EVENTS } } },
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: 60,
  });
  // イベント名でグループ化(行は eventCount 降順なので各グループ内も降順のまま)
  const byEvent = new Map();
  for (const r of evLoc.rows ?? []) {
    const name = r.dimensionValues[0].value;
    if (!byEvent.has(name)) byEvent.set(name, []);
    byEvent.get(name).push({ location: r.dimensionValues[1].value, count: +r.metricValues[0].value });
  }
  console.log("\n## GA4 CTA設置箇所別(今期)");
  for (const [name, locs] of byEvent) {
    console.log(`${name}`);
    for (const l of locs.slice(0, 8)) console.log(`  ${l.location}  ${l.count}回`);
    if (locs.length > 8) console.log(`  …他${locs.length - 8}件`);
  }

  const funnel = await ga4({
    dateRanges: [cur],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "/r/booking/" } } },
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 10,
  });
  if ((funnel.rows ?? []).length > 0) {
    console.log("\n## 予約ページ別PV(参考値・同一セッションの通過率ではない)");
    for (const r of funnel.rows ?? [])
      console.log(`${r.dimensionValues[0].value}  PV=${r.metricValues[0].value}`);
  }

  // --- GSC ---
  const all = await gsc({ ...cur, dimensions: ["query"], rowLimit: 200 });
  const rows = all.rows ?? [];
  if (isMonthly) {
    console.log("\n## GSC クエリ上位15");
    for (const r of rows.slice(0, 15))
      console.log(
        `"${r.keys[0]}"  表示${r.impressions} クリック${r.clicks} CTR${(r.ctr * 100).toFixed(0)}% 順位${r.position.toFixed(1)}`
      );
  }
  const missed = rows
    .filter((r) => !isBrandQuery(r.keys[0]) && r.impressions > (isMonthly ? 30 : 10) && r.ctr < 0.15)
    .slice(0, 12);
  console.log(`\n## GSC 取りこぼし候補(非指名・表示あり・CTR<15%)`);
  for (const r of missed)
    console.log(
      `"${r.keys[0]}"  表示${r.impressions} クリック${r.clicks} CTR${(r.ctr * 100).toFixed(0)}% 順位${r.position.toFixed(1)}`
    );

  // --- 記事成績(主指標=入口セッション) ---
  // GSC は Yahoo 経由の記事流入(実測で約1/4)が写らないため、主指標は GA4 の入口セッション。
  // 週次は全体の1行だけ、月初は記事1本1行の明細を出す。
  const [landing, landingPrev] = await Promise.all(
    [cur, prv].map((d) =>
      ga4({
        dateRanges: [d],
        dimensions: [{ name: "landingPagePlusQueryString" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 250,
      })
    )
  );
  const entry = rowsToMap(landing);
  const entryPrev = rowsToMap(landingPrev);
  const entryTotal = sumEntrySessions(entry);
  console.log(
    `\n## 記事の入口セッション合計  ${entryTotal} (${fmtDelta(entryTotal, sumEntrySessions(entryPrev))})`
  );

  if (isMonthly) {
    const [articlePv, articleCta, articleGsc] = await Promise.all([
      ga4({
        dateRanges: [cur],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        dimensionFilter: ARTICLE_PAGE_FILTER,
        limit: 250,
      }),
      ga4({
        dateRanges: [cur],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              ARTICLE_PAGE_FILTER,
              { filter: { fieldName: "eventName", inListFilter: { values: CTA_EVENTS } } },
            ],
          },
        },
        limit: 250,
      }),
      // 旧「GSC コラム記事別クエリ」を置換。/columns/ だけだと /news/ 配下の SEO 記事
      // (例: hyrox-official-training-gym)が丸ごと欠落するため正規表現に広げる。
      gsc({
        ...cur,
        dimensions: ["page", "query"],
        dimensionFilterGroups: [
          {
            filters: [
              { dimension: "page", operator: "includingRegex", expression: "/(columns|news)/" },
            ],
          },
        ],
        rowLimit: 500,
      }),
    ]);

    const articleRows = buildArticleRows({
      entry,
      entryPrev,
      pageViews: rowsToMap(articlePv),
      ctaCounts: rowsToMap(articleCta),
      gscRows: (articleGsc.rows ?? []).map((r) => ({
        page: r.keys[0],
        query: r.keys[1],
        impressions: r.impressions,
        clicks: r.clicks,
        position: r.position,
      })),
    });

    console.log("\n## 記事成績(月初のみ・入口セッション降順)");
    console.log(
      "(CTAは一般クリックを含む100PVあたりの回数。予約転換率ではない。GSCは指名クエリ除外後・取得範囲内の参考値)"
    );
    for (const row of articleRows) console.log(formatArticleRow(row));
  }

  console.log(
    "\n(Labola 予約台帳・会員台帳の集計は Notion MCP で対話中に実行する。個票は出力しない — runbook 参照)"
  );
}

// import されても副作用が出ないよう、直接実行時のみ main() を走らせる。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`分析スクリプト失敗: ${e.message}`);
    process.exit(1);
  });
}
