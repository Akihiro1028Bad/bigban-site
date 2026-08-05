// 対話型分析セッション用の一括集計スクリプト(読み取り専用)
// 使い方:
//   node scripts/analytics/query.mjs            # 週次(直近7日 vs 前7日)
//   node scripts/analytics/query.mjs --days 28  # 月初(直近28日 vs 前28日 + SEO詳細)
// 出力は集計値のみ。書き込みは一切しない。
// 運用手順: docs/operations/interactive-analysis-runbook.md
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  return { days, prevOffset };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** 前日を終端に、今期・前期の日付レンジを作る(GA4/GSC は当日データが不完全なため) */
function ranges(days, prevOffset = days) {
  const end = new Date();
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

function fmtDelta(cur, prev) {
  if (!prev) return "new";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

// 正典: scripts/growth/ctaEvents.ts と同じイベント名(値の重複定義を避けるため主要CTAのみ)
const CTA_EVENTS = [
  "reservation_click",
  "reserve_entry_click",
  "line_click",
  "instagram_click",
  "access_click",
  "price_click",
  "contact_submit",
  "news_cta_click",
];

const BRAND_QUERY = /ピックル.?バン|pickle\s*bang|pbt|セオリー|rst\s*agency/i;

async function main() {
  const { days, prevOffset } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const token = await accessToken(env);
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const { cur, prv } = ranges(days, prevOffset);
  const isMonthly = days >= 28;

  const ga4 = async (body) => {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${env.GROWTH_GA4_PROPERTY_ID}:runReport`,
      { method: "POST", headers: auth, body: JSON.stringify(body) }
    );
    if (!res.ok) throw new Error(`GA4 失敗: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  const gsc = async (body) => {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GROWTH_GSC_SITE_URL)}/searchAnalytics/query`,
      { method: "POST", headers: auth, body: JSON.stringify(body) }
    );
    if (!res.ok) throw new Error(`GSC 失敗: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };

  console.log(`# 分析スナップショット (${cur.startDate}〜${cur.endDate} / 前期 ${prv.startDate}〜${prv.endDate})`);

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

  // --- GA4: CTAイベント + 予約ファネル ---
  const ev = await ga4({
    dateRanges: [cur],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: CTA_EVENTS } } },
    limit: 20,
  });
  console.log("\n## GA4 CTAイベント(今期)");
  for (const r of ev.rows ?? []) console.log(`${r.dimensionValues[0].value}  ${r.metricValues[0].value}回`);

  const funnel = await ga4({
    dateRanges: [cur],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "/r/booking/" } } },
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 10,
  });
  if ((funnel.rows ?? []).length > 0) {
    console.log("\n## 予約ファネル(labola経由ページのPV)");
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
    .filter((r) => !BRAND_QUERY.test(r.keys[0]) && r.impressions > (isMonthly ? 30 : 10) && r.ctr < 0.15)
    .slice(0, 12);
  console.log(`\n## GSC 取りこぼし候補(非指名・表示あり・CTR<15%)`);
  for (const r of missed)
    console.log(
      `"${r.keys[0]}"  表示${r.impressions} クリック${r.clicks} CTR${(r.ctr * 100).toFixed(0)}% 順位${r.position.toFixed(1)}`
    );

  if (isMonthly) {
    const articles = await gsc({
      ...cur,
      dimensions: ["page", "query"],
      dimensionFilterGroups: [
        { filters: [{ dimension: "page", operator: "contains", expression: "/columns/" }] },
      ],
      rowLimit: 20,
    });
    console.log("\n## GSC コラム記事別クエリ(月初のみ)");
    for (const r of articles.rows ?? [])
      console.log(
        `${r.keys[0].replace(/^https?:\/\/[^/]+/, "")}  "${r.keys[1]}"  表示${r.impressions} クリック${r.clicks} 順位${r.position.toFixed(1)}`
      );
  }

  // --- LINE 友だち数(ベストエフォート・失敗しても他の集計は成立) ---
  if (env.LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      const yyyymmdd = isoDate(d).replaceAll("-", "");
      const res = await fetch(`https://api.line.me/v2/bot/insight/followers?date=${yyyymmdd}`, {
        headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "ready") {
          console.log(`\n## LINE 友だち数(${yyyymmdd}時点)`);
          console.log(`フォロワー ${data.followers} / 有効リーチ ${data.targetedReaches} / ブロック ${data.blocks}`);
        } else {
          console.log(`\n## LINE 友だち数: 集計未確定(status=${data.status})`);
        }
      } else {
        console.log(`\n## LINE 友だち数: 取得失敗(${res.status})`);
      }
    } catch (e) {
      console.log(`\n## LINE 友だち数: 取得失敗(${e.message})`);
    }
  }

  console.log(
    "\n(Labola 予約台帳・会員台帳の集計は Notion MCP で対話中に実行する。個票は出力しない — runbook 参照)"
  );
}

main().catch((e) => {
  console.error(`分析スクリプト失敗: ${e.message}`);
  process.exit(1);
});
