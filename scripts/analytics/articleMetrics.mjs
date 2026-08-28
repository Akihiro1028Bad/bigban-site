// 記事成績(月初レポート「## 記事成績」)の純ロジック。
// 主指標は GA4 の入口セッション。GSC は Yahoo 経由の流入が写らないため補助に置く。
// fetch を含む I/O は query.mjs 側に残し、ここは入力→出力の変換だけを持つ(テスト対象)。
// 運用手順と判定の型: docs/operations/interactive-analysis-runbook.md ⑦

/** 記事とみなすパス。一覧ページ("/columns")は含めず、詳細ページだけを拾う。 */
const ARTICLE_PATH = /\/(columns|news)\//;

/** 指名クエリ。SEO の伸びしろ判断と記事の順位評価から除外する(runbook 集計ルール)。 */
const BRAND_QUERY = /ピックル.?バン|pickle\s*bang|pbt|セオリー|rst\s*agency/i;

/**
 * GA4 の landingPagePlusQueryString / GSC の page URL を突き合わせ可能な形に揃える。
 * オリジン・クエリ文字列・末尾スラッシュを落とす(プレビューURLが別記事に割れるのを防ぐ)。
 */
export function normalizeArticlePath(value) {
  const withoutOrigin = value.replace(/^https?:\/\/[^/]+/, "");
  const withoutQuery = withoutOrigin.split("?")[0];
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/$/, "") : withoutQuery;
}

export function isArticlePath(path) {
  return ARTICLE_PATH.test(path);
}

export function isBrandQuery(query) {
  return BRAND_QUERY.test(query);
}

/** 前期比を "+12%" / "-5%" / "new" / "-" で表す。query.mjs と共有する正準実装。 */
export function formatDelta(cur, prev) {
  if (!prev) return cur ? "new" : "-";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/** 記事パスの入口セッションだけを合計する(週次の1行サマリ用)。 */
export function sumEntrySessions(entry) {
  let total = 0;
  for (const [path, sessions] of entry) {
    if (isArticlePath(path)) total += sessions;
  }
  return total;
}

/** 正規化済みパスをキーに、記事だけを合算した Map を作る。 */
function collectByArticlePath(source) {
  const result = new Map();
  for (const [rawPath, value] of source) {
    const path = normalizeArticlePath(rawPath);
    if (!isArticlePath(path)) continue;
    result.set(path, (result.get(path) ?? 0) + value);
  }
  return result;
}

/** GSC 行を記事ごとに畳み込む。指名クエリは順位・クリックに混ぜず表示回数だけ別に数える。 */
function collectGsc(gscRows) {
  const result = new Map();
  for (const row of gscRows) {
    const path = normalizeArticlePath(row.page);
    if (!isArticlePath(path)) continue;
    const acc = result.get(path) ?? {
      impressions: 0,
      clicks: 0,
      weightedPosition: 0,
      brandImpressions: 0,
    };
    if (isBrandQuery(row.query)) {
      acc.brandImpressions += row.impressions;
    } else {
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.weightedPosition += row.position * row.impressions;
    }
    result.set(path, acc);
  }
  return result;
}

/**
 * 記事1本 = 1行のデータを組み立てる。入口セッションの降順。
 *
 * CTA率の分母は **PV** を使う。入口セッションを分母にすると、サイト内回遊で読まれる
 * 告知系記事(PBT Club 募集・お盆告知など)で 100% を超えて意味をなさなくなるため
 * (2026-08-28 の実測で判明。117%〜500% が出ていた)。
 */
export function buildArticleRows({ entry, entryPrev, pageViews, ctaCounts, gscRows }) {
  const entryByPath = collectByArticlePath(entry);
  const prevByPath = collectByArticlePath(entryPrev);
  const pvByPath = collectByArticlePath(pageViews);
  const ctaByPath = collectByArticlePath(ctaCounts);
  const gscByPath = collectGsc(gscRows);

  const paths = new Set([
    ...entryByPath.keys(),
    ...pvByPath.keys(),
    ...ctaByPath.keys(),
    ...gscByPath.keys(),
  ]);

  return [...paths]
    .map((path) => {
      const pv = pvByPath.get(path) ?? 0;
      const ctaCount = ctaByPath.get(path) ?? 0;
      const gsc = gscByPath.get(path);
      return {
        path,
        entrySessions: entryByPath.get(path) ?? 0,
        prevEntrySessions: prevByPath.get(path) ?? 0,
        pageViews: pv,
        ctaCount,
        ctaRate: pv > 0 ? ctaCount / pv : null,
        gscImpressions: gsc?.impressions ?? 0,
        gscClicks: gsc?.clicks ?? 0,
        gscPosition:
          gsc && gsc.impressions > 0 ? gsc.weightedPosition / gsc.impressions : null,
        brandImpressions: gsc?.brandImpressions ?? 0,
      };
    })
    .sort((a, b) => b.entrySessions - a.entrySessions);
}

export function formatArticleRow(row) {
  const delta = formatDelta(row.entrySessions, row.prevEntrySessions);
  const rate = row.ctaRate === null ? "-" : `${Math.round(row.ctaRate * 100)}%`;
  const gsc =
    row.gscImpressions > 0
      ? `表示${row.gscImpressions} クリック${row.gscClicks} 順位${row.gscPosition.toFixed(1)}`
      : "表示なし";
  const brand = row.brandImpressions > 0 ? `  指名表示${row.brandImpressions}` : "";
  return `${row.path}  入口S=${row.entrySessions} (${delta})  PV=${row.pageViews}  CTA=${row.ctaCount} (${rate})  GSC非指名: ${gsc}${brand}`;
}
