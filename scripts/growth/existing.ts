/**
 * 週次モードの「既存行(グラウンドトゥルース)」を組み立てる純関数群。
 *
 * headless の週次エージェントは MCP では Notion の行を列挙できず、Bash も
 * `npm run growth:fetch` のみ許可のため、これまで「対象週が処理済みか」を
 * 推測するしかなく、未作成のレポート・施策まで誤ってスキップしていた。
 *
 * ここでは Notion repository で読み出した実ページを、エージェントが
 * そのまま重複防止・学習ループの判断材料にできる Markdown へ整形する。I/O は
 * 配線側(existing-cli.ts)が担い、本モジュールは純粋でテスト可能に保つ。
 */

import type { NotionPage } from "./notion";
import { growthMediaForRow } from "./endpoint";
import { parseMetrics } from "./metrics";
import { daysSincePublished, reviewLabels, type ReviewLabel } from "./metricsReview";
import { reservationIntent } from "./ctaEvents";
import { isReservationDataFresh } from "./reservations";
import {
  renderPerformanceSummary,
  summarizeArticlePerformance,
} from "./performanceSummary";

/** 週次レポートの「対象週開始」が指定日に一致する Notion フィルタ。 */
export function weekStartEqualsFilter(weekStart: string): unknown {
  return { property: "対象週開始", date: { equals: weekStart } };
}

export interface ExistingInput {
  period: { start: string; end: string };
  /** 記事単位ラベルの公開後経過日数を決定的に算出するための現在時刻(ms)。 */
  nowMs: number;
  /** 対象週開始 = period.start で絞り込んだ週次レポート行。 */
  reportsForWeek: NotionPage[];
  /** 施策提案 DB の全行(重複防止・学習ループの判断材料)。 */
  proposals: NotionPage[];
  /** 記事ネタ案 DB の全行。 */
  ideas: NotionPage[];
}

function titleText(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { title?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

function richText(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

function selectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function dateStart(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  return value?.date?.start ?? "";
}

/** number プロパティを読む。未設定/非数値は null(手入力の欠落耐性)。 */
function numberValue(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { number?: number | null } | undefined;
  return typeof value?.number === "number" ? value.number : null;
}

/** オーナー週次手入力(改善案#4)。週次グロースレポート DB の任意 number プロパティ。 */
const MANUAL_INPUT_PROPS = [
  { prop: "LINE友だち数", label: "LINE友だち数" },
  { prop: "IGフォロワー数", label: "IGフォロワー数" },
  { prop: "口コミ件数", label: "口コミ件数" },
  { prop: "口コミ平均評価", label: "口コミ平均評価" },
] as const;

const PUBLISHED_STATUS = "公開済み";
const DEAD_STATUSES = new Set(["却下", "見送り"]);
const SEARCH_INTENT_EMPTY = "(検索意図未記入)";
const KNOWN_ARTICLE_TYPES = ["獲得", "不安解消", "資産", "比較", "イベント"] as const;
const UNSET_ARTICLE_TYPE = "タイプ未設定";
const COLUMN_MEDIA_LABEL = "コラム";
const NEWS_MEDIA_LABEL = "ニュース";
const REVIEW_LABEL_FALLBACK: ReviewLabel[] = ["未計測"];
export const COLD_START_EXPERIMENT_MARKER = "【コールドスタート実験】";

function isLiveIdea(page: NotionPage): boolean {
  return !DEAD_STATUSES.has(selectName(page, "ステータス"));
}

function articleTitle(page: NotionPage): string {
  return titleText(page, "タイトル案") || "(無題)";
}

function mediaLabelForPage(page: NotionPage): typeof COLUMN_MEDIA_LABEL | typeof NEWS_MEDIA_LABEL {
  return growthMediaForRow(selectName(page, "媒体")) === "news" ? NEWS_MEDIA_LABEL : COLUMN_MEDIA_LABEL;
}

/**
 * レポート行として「本文が作成済み」か(= `レポート` title を持つ)。
 * オーナーが数字だけ先に入れた手入力行(title 無し)を「作成済み」に数えないための判定。
 */
function isCreatedReport(page: NotionPage): boolean {
  return titleText(page, "レポート") !== "";
}

/**
 * 対象週のレポート行群からオーナー手入力(LINE/IG/口コミ)を1行ずつ抽出する。
 * 複数行に散っていても最初に値が入っているものを採用(欠落耐性)。未入力の指標は含めない。
 */
function manualInputLines(reportsForWeek: NotionPage[]): string[] {
  return MANUAL_INPUT_PROPS.flatMap(({ prop, label }) => {
    for (const page of reportsForWeek) {
      const value = numberValue(page, prop);
      if (value !== null) return [`- ${label}: ${value}`];
    }
    return [];
  });
}

function proposalLines(proposals: NotionPage[]): string[] {
  return proposals.map((page) => {
    const weekKey = richText(page, "週キー") || "週キー無し";
    const category = selectName(page, "カテゴリ") || "カテゴリ無し";
    const status = selectName(page, "ステータス") || "ステータス無し";
    const name = titleText(page, "施策名") || "(無題)";
    const head = `- [${weekKey} | ${category} | ${status}] ${name}`;

    // 却下・見送りは学習ループの入力として判断者メモ・検証結果を併記する。
    if (status === "却下" || status === "見送り") {
      const extras: string[] = [];
      const memo = richText(page, "判断者メモ");
      const verification = selectName(page, "検証結果");
      if (memo) extras.push(`判断者メモ: ${memo}`);
      if (verification && verification !== "未検証") extras.push(`検証結果: ${verification}`);
      if (extras.length > 0) return `${head}\n  - ${extras.join(" / ")}`;
    }
    return head;
  });
}

function ideaLines(ideas: NotionPage[]): string[] {
  return ideas.map((page) => {
    const weekStartValue = dateStart(page, "対象週開始") || "週開始無し";
    const status = selectName(page, "ステータス") || "ステータス無し";
    const titleValue = titleText(page, "タイトル案") || "(無題)";
    const head = `- [${weekStartValue} | ${status}] ${titleValue}`;

    const reason = richText(page, "却下理由");
    const postJudgement = selectName(page, "公開後判定");
    const isColdStartExperiment = richText(page, "根拠").includes(
      COLD_START_EXPERIMENT_MARKER
    );
    const extras: string[] = [];

    if (isColdStartExperiment) extras.push("コールドスタート実験");

    if (postJudgement === "要改稿") {
      const tail = reason ? `公開後判定: 要改稿 / 却下理由: ${reason}` : `公開後判定: 要改稿`;
      extras.push(tail);
    } else if ((status === "却下" || status === "見送り") && reason) {
      extras.push(`却下理由: ${reason}`);
    } else if (isColdStartExperiment && status === PUBLISHED_STATUS) {
      extras.push(
        postJudgement && postJudgement !== "未判定"
          ? `公開後判定: ${postJudgement}`
          : "公開後判定: 未判定（観測中）"
      );
    }
    return extras.length > 0 ? `${head}\n  - ${extras.join(" / ")}` : head;
  });
}

/**
 * 生きているネタの (タイトル案, 検索意図) 一覧を Markdown 行にする。
 * 却下・見送りは除外し、検索意図が空でも未記入として明示する。
 */
export function searchIntentIndexLines(ideas: readonly NotionPage[]): string[] {
  const liveIdeas = ideas.filter(isLiveIdea);
  if (liveIdeas.length === 0) return ["(生きているネタが無いためインデックスは空)"];

  return liveIdeas.map((page) => {
    const intent = richText(page, "検索意図") || SEARCH_INTENT_EMPTY;
    return `- ${articleTitle(page)} ｜ 検索意図: ${intent}`;
  });
}

/**
 * 生きているネタを 記事タイプ×媒体 でクロス集計した本数表にする。
 * 既知5型は0件でも出し、記事タイプ欠落は「タイプ未設定」に寄せる。
 */
export function coverageCrossTabLines(ideas: readonly NotionPage[]): string[] {
  const liveIdeas = ideas.filter(isLiveIdea);
  if (liveIdeas.length === 0) return ["(生きているネタが無いためカバレッジは空)"];

  const rows = new Map<string, { column: number; news: number }>();
  for (const articleType of KNOWN_ARTICLE_TYPES) {
    rows.set(articleType, { column: 0, news: 0 });
  }

  for (const page of liveIdeas) {
    const articleType = selectName(page, "記事タイプ") || UNSET_ARTICLE_TYPE;
    const current = rows.get(articleType) ?? { column: 0, news: 0 };
    if (mediaLabelForPage(page) === NEWS_MEDIA_LABEL) {
      current.news += 1;
    } else {
      current.column += 1;
    }
    rows.set(articleType, current);
  }

  const orderedTypes: string[] = [...KNOWN_ARTICLE_TYPES];
  if (rows.has(UNSET_ARTICLE_TYPE)) orderedTypes.push(UNSET_ARTICLE_TYPE);

  return [
    "| 記事タイプ | コラム | ニュース |",
    "|---|---:|---:|",
    ...orderedTypes.map((articleType) => {
      const counts = rows.get(articleType)!;
      return `| ${articleType} | ${counts.column} | ${counts.news} |`;
    }),
    "(薄い型・媒体は探索候補の材料にする。ただし記事タイプ別の成功率・判定済み母数・未判定率・観測条件を確認し、根拠なく薄い枠を量産しない)",
  ];
}

/**
 * 公開済み記事1本ごとの reviewLabels 行を作る。
 * 成績データが空/不正の公開済み記事も「未計測」として出し、黙って落とさない。
 */
export function articleReviewLabelLines(
  ideas: readonly NotionPage[],
  nowMs: number
): string[] {
  const publishedIdeas = ideas.filter((page) => selectName(page, "ステータス") === PUBLISHED_STATUS);
  if (publishedIdeas.length === 0) return ["(公開済み記事がまだ無いため記事単位ラベルは空)"];

  return publishedIdeas.map((page) => {
    const metrics = parseMetrics(richText(page, "成績データ"));
    const labels =
      metrics === null
        ? REVIEW_LABEL_FALLBACK
        : reviewLabels(
            metrics,
            metrics.publishedAt ? daysSincePublished(metrics.publishedAt, nowMs) : null
          );
    const suffix = labels.length > 0 ? `: ${labels.join("・")}` : "";
    if (!metrics) return `- ${articleTitle(page)}${suffix}`;
    const outcomes: string[] = [];
    if (metrics.ctaEvents && metrics.ctaEventsMeasured === true) {
      outcomes.push(
        `予約意図=${reservationIntent(metrics.ctaEvents).current}`,
        `LINE=${metrics.ctaEvents.lineClick.current}`,
        `Instagram=${metrics.ctaEvents.instagramClick.current}`,
        `その他CTA=${metrics.ctaEvents.other.current}`
      );
    }
    const actual = metrics.actualReservations;
    if (actual?.state === "missing") {
      if (actual.reason === "coverage_incomplete" && actual.coverage) {
        outcomes.push(
          `実予約=収録不足（当週=${actual.coverage.current ? "収録" : "未収録"} / ` +
            `前週=${actual.coverage.prior ? "収録" : "未収録"}、予約意図は代理指標）`
        );
      } else {
        outcomes.push("実予約=欠損（予約意図は代理指標）");
      }
    } else if (actual?.state === "available") {
      if (!isReservationDataFresh(actual.syncedAt, new Date(nowMs).toISOString())) {
        outcomes.push(`実予約=古い（最終取込 ${actual.syncedAt}、予約意図は代理指標）`);
      } else {
        outcomes.push(
          `施設全体実予約=${actual.facility.current}`,
          actual.article ? `記事帰属実予約=${actual.article.current}` : "記事帰属実予約=なし"
        );
      }
    }
    return outcomes.length > 0
      ? `- ${articleTitle(page)}${suffix}\n  - イベント別成果: ${outcomes.join(" / ")}`
      : `- ${articleTitle(page)}${suffix}`;
  });
}

/**
 * 既存行を、週次エージェントがそのまま重複防止・学習ループに使える Markdown にする。
 * 先頭に「対象週レポートの作成済み/未作成」という明確な判定を置く。
 */
export function summarizeExisting(input: ExistingInput): string {
  const { period, nowMs, reportsForWeek, proposals, ideas } = input;
  const lines: string[] = [];

  lines.push(`# 既存行(Notion グラウンドトゥルース)`);
  lines.push(`対象週: ${period.start}〜${period.end}`);
  lines.push("");

  // #4: 「作成済み」判定は レポート本文(title)を持つ行に限る。数字だけの手入力行は数えない。
  const createdReports = reportsForWeek.filter(isCreatedReport);
  if (createdReports.length > 0) {
    lines.push(`## 週次グロースレポート: 作成済み(${createdReports.length}件)`);
    lines.push(`対象週開始=${period.start} の行が既に存在します。レポートは再作成しないでください。`);
  } else {
    lines.push(`## 週次グロースレポート: 未作成`);
    lines.push(
      `対象週開始=${period.start} の行は存在しません。重複ではないので、週次レポートを新規作成してください。`
    );
  }
  lines.push("");

  // #4: オーナー週次手入力(LINE/IG/口コミ)。実 KPI に接地させる分析入力。
  const manual = manualInputLines(reportsForWeek);
  lines.push(`## オーナー手入力(実 KPI・改善案#4)`);
  if (manual.length > 0) {
    lines.push(...manual);
    lines.push(`(この実数を分析の成功指標の分母=SNS・口コミに使う。未入力の指標は推測しない)`);
  } else {
    lines.push(`手入力データなし(従来どおり GA4/GSC と Web 検索だけで分析。数字は推測しない)`);
  }
  lines.push("");

  lines.push(`## 施策提案: 既存 ${proposals.length}件`);
  if (proposals.length > 0) {
    lines.push(...proposalLines(proposals));
    lines.push(
      `(同一週キー・同一施策名は再作成しない。却下/見送り済みの方向性は学習ループとして避ける)`
    );
  } else {
    lines.push(`(既存行なし)`);
  }
  lines.push("");

  lines.push(`## 記事ネタ案: 既存 ${ideas.length}件`);
  if (ideas.length > 0) {
    lines.push(...ideaLines(ideas));
    lines.push(`(同一対象週・同一テーマは再作成しない)`);
  } else {
    lines.push(`(既存行なし)`);
  }
  lines.push("");

  lines.push(`## 検索意図インデックス(生きているネタ・カニバリ回避の材料)`);
  lines.push(...searchIntentIndexLines(ideas));
  lines.push(
    `(新ネタの検索意図が上記と実質同一なら出さない=カニバリ回避。角度違いなら差分が勝ち筋に書けるときだけ可)`
  );
  lines.push("");

  lines.push(`## カバレッジ集計(生きているネタ・記事タイプ×媒体・薄い枠の材料)`);
  lines.push(...coverageCrossTabLines(ideas));
  lines.push("");

  lines.push(`## 公開済み記事の判定ラベル(記事単位・次の打ち手の材料)`);
  lines.push(...articleReviewLabelLines(ideas, nowMs));
  lines.push(
    `(ラベルは機械判定の参考値。CTR弱い→タイトル/description、順位あと少し→リライト/内部リンク、読まれるが予約意図弱い→予約導線、要改稿→改稿。最終判断は分析で行う)`
  );
  lines.push("");

  // #221/#286: 公開済み記事の記事タイプ別 成績サマリ。
  // 率・母数・未判定率・観測条件をセットで供給し、低母数の自動順位付けを避ける。
  lines.push(...renderPerformanceSummary(summarizeArticlePerformance(ideas, nowMs)));

  return lines.join("\n");
}
