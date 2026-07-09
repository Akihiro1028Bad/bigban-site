/**
 * 週次スナップショットの要点を LINE 向けの平易なテキストに整形する純関数。
 *
 * 非エンジニアが読む前提で、指標は「人の行動」に翻訳し、専門用語を避ける。
 * 入出力のみに依存(I/O なし)させ、テスト容易性とカバレッジを確保する。
 */

import type { NotionBlock } from "./notion";

export interface MetricValue {
  current: number;
  prior: number;
  /** 前週比%。前週データが無い場合は null。 */
  deltaPct: number | null;
}

export interface WeeklyMetrics {
  sessions?: MetricValue;
  clicks?: MetricValue;
  impressions?: MetricValue;
  /** 掲載順位(小さいほど良い)。 */
  position?: MetricValue;
}

export interface DigestInput {
  periodLabel: string;
  metrics: WeeklyMetrics;
  topActions: string[];
  pendingCount: number;
  reportUrl: string | null;
  approveUrl: string | null;
  /** 先頭に表示する警告行(トークン失効間近など)。省略可。 */
  warnings?: string[];
  /** 実行時の短縮 SHA(#219)。デプロイ側 SHA とのスキュー確認用。空/未指定なら非表示。 */
  sha?: string;
  /** Notionレポート本文から抽出した質的な要約。空/未指定なら非表示。 */
  reportSummary?: ReportSummary;
  /** APPROVE_SECRET。空/未設定なら非表示。 */
  passphrase?: string | null;
}

const MAX_TOP_ACTIONS = 3;
const MAX_SUMMARY_LINES = 3;
const MAX_SUMMARY_CHARS = 120;

export interface ReportSummary {
  discussion: string[];
  dataNotes: string[];
}

type SummarySection = keyof ReportSummary;

function formatInt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 大きいほど良い指標(訪問・クリック等)の前週比を平易な語にする。 */
function deltaPhrase(deltaPct: number | null): string {
  if (deltaPct === null) return "(前週データなし)";
  if (deltaPct === 0) return "前週から横ばい";
  const word = deltaPct > 0 ? "増" : "減";
  return `前週より${Math.abs(deltaPct)}%${word}`;
}

/** 掲載順位(小さいほど良い)の前週比を平易な語にする。 */
function positionPhrase(m: MetricValue): string {
  if (m.deltaPct === null) return "(前週データなし)";
  if (m.current === m.prior) return "前週から横ばい";
  return m.current < m.prior ? "前週より改善" : "前週より悪化";
}

function plainTextOf(block: NotionBlock): string {
  const payload = block[block.type];
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return "";

  const richText = (payload as Record<string, unknown>).rich_text;
  if (!Array.isArray(richText)) return "";

  return richText
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return "";
      const plainText = (item as Record<string, unknown>).plain_text;
      return typeof plainText === "string" ? plainText : "";
    })
    .join("");
}

function sectionForHeading(text: string): SummarySection | null {
  if (text.includes("論点")) return "discussion";
  if (text.includes("データ注意")) return "dataNotes";
  return null;
}

function truncateSummaryLine(line: string): string {
  return line.length > MAX_SUMMARY_CHARS
    ? `${line.slice(0, MAX_SUMMARY_CHARS - 1)}…`
    : line;
}

function addSummaryLine(summary: ReportSummary, section: SummarySection, text: string): void {
  if (summary[section].length >= MAX_SUMMARY_LINES) return;
  const line = text.trim();
  if (!line) return;
  summary[section].push(truncateSummaryLine(line));
}

export function extractReportSummary(blocks: readonly NotionBlock[]): ReportSummary {
  const summary: ReportSummary = { discussion: [], dataNotes: [] };
  let currentSection: SummarySection | null = null;

  blocks.forEach((block) => {
    if (block.type === "heading_2" || block.type === "heading_3") {
      currentSection = sectionForHeading(plainTextOf(block));
      return;
    }

    if (
      currentSection &&
      (block.type === "paragraph" || block.type === "bulleted_list_item")
    ) {
      addSummaryLine(summary, currentSection, plainTextOf(block));
    }
  });

  return summary;
}

export function buildDigestMessage(input: DigestInput): string {
  const warnings = input.warnings ?? [];
  const head = warnings.length > 0 ? [...warnings, ""] : [];
  const lines: string[] = [...head, `📊 今週のグロース (${input.periodLabel})`, ""];

  const m = input.metrics;
  if (m.sessions) {
    lines.push(`・サイト訪問 ${formatInt(m.sessions.current)}回 ${deltaPhrase(m.sessions.deltaPct)}`);
  }
  if (m.clicks) {
    lines.push(`・検索からの訪問 ${formatInt(m.clicks.current)}回 ${deltaPhrase(m.clicks.deltaPct)}`);
  }
  if (m.impressions) {
    lines.push(`・検索結果に出た回数 ${formatInt(m.impressions.current)}回 ${deltaPhrase(m.impressions.deltaPct)}`);
  }
  if (m.position) {
    lines.push(`・検索順位 ${m.position.current.toFixed(1)}位 ${positionPhrase(m.position)}`);
  }

  if (input.topActions.length > 0) {
    lines.push("", "■ 今週やること");
    input.topActions.slice(0, MAX_TOP_ACTIONS).forEach((action, i) => {
      lines.push(`${i + 1}. ${action}`);
    });
  }

  lines.push("", `承認待ち ${input.pendingCount}件`);

  const discussion = input.reportSummary?.discussion ?? [];
  if (discussion.length > 0) {
    lines.push("", "■ 論点");
    discussion.forEach((line) => lines.push(`・${line}`));
  }

  const dataNotes = input.reportSummary?.dataNotes ?? [];
  if (dataNotes.length > 0) {
    lines.push("", "■ データ注意");
    dataNotes.forEach((line) => lines.push(`・${line}`));
  }

  if (input.reportUrl) lines.push(`レポートを見る → ${input.reportUrl}`);
  if (input.approveUrl) lines.push(`承認する → ${input.approveUrl}`);
  const passphrase = input.passphrase?.trim();
  if (passphrase) lines.push(`🔑 合言葉: ${passphrase}`);

  const sha = input.sha?.trim();
  if (sha) lines.push("", `実行 SHA: ${sha}`);

  return lines.join("\n");
}

/** LINE Flex メッセージの altText の文字数上限。 */
export const LINE_ALT_TEXT_MAX = 400;

/**
 * Flex の altText を LINE の上限(400字)に収める。全文は Flex 本文側にあるため、
 * altText は超過分を末尾「…」で丸める(上限超過だと LINE が Flex 送信を丸ごと拒否するため)。
 */
export function clampAltText(text: string, max: number = LINE_ALT_TEXT_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * 週次の自動実行が異常終了したときに LINE へ送る失敗通知の本文。
 * スナップショットや Notion を読まずに送れるよう、ログの場所だけを伝える。
 */
export function buildFailureMessage(logPath: string): string {
  return [
    "❌ 今週の自動実行に失敗しました。",
    `ログを確認してください: ${logPath}`,
  ].join("\n");
}
