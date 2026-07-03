/**
 * 公開済み記事の「記事タイプ別 成績サマリ」を組み立てる純ロジック(#221 / P2⑨)。
 *
 * 「計測 → 次回提案」の学習弧を code 上で閉じるための供給側。週次エージェントは
 * `growth:existing` の出力しか確実に読めない(headless では MCP で行を列挙できない)ため、
 * ここで「記事ネタ案」DB の既存プロパティ(`記事タイプ`/`公開後判定`/`成績データ`)を
 * **記事タイプ軸で集計**し、weekly が「避ける学習」に加えて**「伸ばす学習(効いた型を厚くする)」**の
 * 入力として読めるようにする。
 *
 * データ源(すべて既存プロパティ・新規追加なし):
 * - `ステータス` = `公開済み` の行だけを集計対象にする(公開前の仮説は成績が無い)。
 * - `記事タイプ`(select・獲得/不安解消/資産/比較/イベント) = 集計の軸(内部計測軸・AD8)。
 * - `公開後判定`(select・未判定/成功/様子見/要改稿) = 人が最終決定した公開後判定(review-due.ts)。
 * - `成績データ`(rich_text JSON) = GA4/GSC ミラー。`search.topQueries` から「勝ったクエリ」を抽出。
 *
 * **欠落耐性(#221 受け入れ基準・欠落耐性)**: プロパティ未設定・公開0本でも空サマリで壊れない。
 *   - `記事タイプ` 欠落 → 「タイプ未設定」バケットに寄せる(黙って落とさない)。
 *   - `公開後判定` 未設定/未判定 → 「未判定」として数える(成功/様子見/要改稿には入れない)。
 *   - `成績データ` 空/不正 → 勝ちクエリ無しとして扱う(parseMetrics が null を返す)。
 *
 * I/O は持たない。呼び出し側(existing.ts)が Notion 行を渡す。承認画面(src)からは
 * src/lib/growth/performanceSummary.ts 経由で参照できる(純ロジック分離規約)。
 */

import { parseMetrics, METRICS_PROPS } from "./metrics";
import type { NotionPage } from "./notion";

/** 集計対象にする記事ステータス(公開済みのみ成績がある)。 */
const PUBLISHED_STATUS = "公開済み";
/** 記事タイプ欠落時のバケット名(黙って落とさず可視化する)。 */
const UNTYPED_BUCKET = "タイプ未設定";
/** 人が付ける公開後判定 select の値(未判定は「まだ判定していない」)。 */
const VERDICT_SUCCESS = "成功";
const VERDICT_WATCH = "様子見";
const VERDICT_REWRITE = "要改稿";
/** 勝ちクエリとして拾う上限(タイプごと)。ノイズを避け要点だけ供給する。 */
const WINNING_QUERIES_PER_TYPE = 3;
/** 勝ちクエリの最小クリック数(0クリックは「勝った」と言えない)。 */
const WINNING_QUERY_MIN_CLICKS = 1;

/** 記事タイプ1件ぶんの公開後成績集計。 */
export interface ArticleTypePerformance {
  /** 記事タイプ(獲得/不安解消/資産/比較/イベント、または「タイプ未設定」)。 */
  articleType: string;
  /** このタイプの公開済み記事数。 */
  published: number;
  /** `公開後判定`=成功 の本数。 */
  success: number;
  /** `公開後判定`=様子見 の本数。 */
  watch: number;
  /** `公開後判定`=要改稿 の本数。 */
  rewrite: number;
  /** まだ人が判定していない本数(未判定/未設定)。 */
  unjudged: number;
  /** このタイプで勝ったクエリ(クリック降順・重複排除・上位数件)。 */
  winningQueries: string[];
}

function selectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return (value?.select?.name ?? "").trim();
}

function richTextValue(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

interface Bucket {
  published: number;
  success: number;
  watch: number;
  rewrite: number;
  unjudged: number;
  /** query → 累計クリック数(重複クエリはクリックを合算し、最も効いた順に並べる)。 */
  queryClicks: Map<string, number>;
}

function newBucket(): Bucket {
  return {
    published: 0,
    success: 0,
    watch: 0,
    rewrite: 0,
    unjudged: 0,
    queryClicks: new Map<string, number>(),
  };
}

/** `成績データ` JSON から勝ちクエリ(クリック>=下限)を bucket に加算する。空/不正は無視。 */
function accumulateWinningQueries(bucket: Bucket, page: NotionPage): void {
  const metrics = parseMetrics(richTextValue(page, METRICS_PROPS.data));
  const topQueries = metrics?.search?.topQueries ?? [];
  for (const q of topQueries) {
    const query = q.query.trim();
    if (!query || q.clicks < WINNING_QUERY_MIN_CLICKS) continue;
    bucket.queryClicks.set(query, (bucket.queryClicks.get(query) ?? 0) + q.clicks);
  }
}

/** bucket の判定カウンタに、人が付けた `公開後判定` を反映する。 */
function tallyVerdict(bucket: Bucket, verdict: string): void {
  if (verdict === VERDICT_SUCCESS) bucket.success += 1;
  else if (verdict === VERDICT_WATCH) bucket.watch += 1;
  else if (verdict === VERDICT_REWRITE) bucket.rewrite += 1;
  else bucket.unjudged += 1; // 未判定/未設定/未知の値はすべて「未判定」に寄せる。
}

/** クリック降順で上位のクエリ名だけを返す(件数上限つき)。 */
function topWinningQueries(queryClicks: Map<string, number>): string[] {
  return [...queryClicks.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, WINNING_QUERIES_PER_TYPE)
    .map(([query]) => query);
}

/**
 * 記事ネタ案の行から、**公開済み記事の記事タイプ別 成績サマリ**を作る(純関数)。
 * 公開前(ステータス≠公開済み)の行は成績が無いので除外する。公開0本なら空配列を返す。
 */
export function summarizeArticlePerformance(
  ideas: readonly NotionPage[]
): ArticleTypePerformance[] {
  const buckets = new Map<string, Bucket>();

  for (const page of ideas) {
    if (selectName(page, "ステータス") !== PUBLISHED_STATUS) continue;
    const articleType = selectName(page, "記事タイプ") || UNTYPED_BUCKET;
    const bucket = buckets.get(articleType) ?? newBucket();
    bucket.published += 1;
    tallyVerdict(bucket, selectName(page, "公開後判定"));
    accumulateWinningQueries(bucket, page);
    buckets.set(articleType, bucket);
  }

  return [...buckets.entries()].map(([articleType, bucket]) => ({
    articleType,
    published: bucket.published,
    success: bucket.success,
    watch: bucket.watch,
    rewrite: bucket.rewrite,
    unjudged: bucket.unjudged,
    winningQueries: topWinningQueries(bucket.queryClicks),
  }));
}

/**
 * 記事タイプ別成績サマリを、週次エージェントが読める Markdown 行に整形する(純関数)。
 * 公開0本のときは学習の入力が無い旨を明示する(沈黙させない・#24 の思想)。
 */
export function renderPerformanceSummary(
  summaries: readonly ArticleTypePerformance[]
): string[] {
  const lines: string[] = [];
  lines.push(`## 公開済み記事の成績サマリ(記事タイプ別・伸ばす学習の入力)`);

  const totalPublished = summaries.reduce((sum, s) => sum + s.published, 0);
  if (totalPublished === 0) {
    lines.push(
      `(公開済み記事がまだ無いため成績サマリは空。公開後に「効いた型」を厚くする学習を開始する)`
    );
    return lines;
  }

  // 成功本数の多いタイプを上に(効いた型が一目で分かるように)。
  const ordered = [...summaries].sort(
    (a, b) => b.success - a.success || b.published - a.published
  );
  for (const s of ordered) {
    const head =
      `- ${s.articleType}: 公開${s.published}本 ` +
      `(成功${s.success}・様子見${s.watch}・要改稿${s.rewrite}・未判定${s.unjudged})`;
    lines.push(head);
    if (s.winningQueries.length > 0) {
      lines.push(`  - 勝ったクエリ: ${s.winningQueries.join(" / ")}`);
    }
  }
  lines.push(
    `(成功が多い型＝効いた型。次回提案では効いた型を優先して厚くする=伸ばす学習。要改稿が多い型は角度を変える)`
  );
  return lines;
}
