/**
 * 週次モードの「既存行(グラウンドトゥルース)」を組み立てる純関数群。
 *
 * headless の週次エージェントは MCP では Notion の行を列挙できず、Bash も
 * `npm run growth:fetch` のみ許可のため、これまで「対象週が処理済みか」を
 * 推測するしかなく、未作成のレポート・施策まで誤ってスキップしていた。
 *
 * ここでは Notion REST(`queryDataSource`)で読み出した実ページを、エージェントが
 * そのまま重複防止・学習ループの判断材料にできる Markdown へ整形する。I/O は
 * 配線側(existing-cli.ts)が担い、本モジュールは純粋でテスト可能に保つ。
 */

import type { NotionPage } from "./notion";
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
  { prop: "予約件数", label: "予約件数" },
  { prop: "LINE友だち数", label: "LINE友だち数" },
  { prop: "IGフォロワー数", label: "IGフォロワー数" },
  { prop: "口コミ件数", label: "口コミ件数" },
  { prop: "口コミ平均評価", label: "口コミ平均評価" },
] as const;

/**
 * レポート行として「本文が作成済み」か(= `レポート` title を持つ)。
 * オーナーが数字だけ先に入れた手入力行(title 無し)を「作成済み」に数えないための判定。
 */
function isCreatedReport(page: NotionPage): boolean {
  return titleText(page, "レポート") !== "";
}

/**
 * 対象週のレポート行群からオーナー手入力(予約/LINE/IG/口コミ)を1行ずつ抽出する。
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
    return `- [${weekStartValue} | ${status}] ${titleValue}`;
  });
}

/**
 * 既存行を、週次エージェントがそのまま重複防止・学習ループに使える Markdown にする。
 * 先頭に「対象週レポートの作成済み/未作成」という明確な判定を置く。
 */
export function summarizeExisting(input: ExistingInput): string {
  const { period, reportsForWeek, proposals, ideas } = input;
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

  // #4: オーナー週次手入力(予約/LINE/IG/口コミ)。実 KPI に接地させる分析入力。
  const manual = manualInputLines(reportsForWeek);
  lines.push(`## オーナー手入力(実 KPI・改善案#4)`);
  if (manual.length > 0) {
    lines.push(...manual);
    lines.push(`(この実数を分析の成功指標の分母=実予約・SNS・口コミに使う。未入力の指標は推測しない)`);
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

  // #221: 公開済み記事の記事タイプ別 成績サマリ(伸ばす学習の入力)。
  // 「避ける学習」(却下/見送りの併記)に加え、「効いた型を厚くする」判断材料を供給する。
  lines.push(...renderPerformanceSummary(summarizeArticlePerformance(ideas)));

  return lines.join("\n");
}
