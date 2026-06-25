/**
 * 週次スナップショットの要点を LINE 向けの平易なテキストに整形する純関数。
 *
 * 非エンジニアが読む前提で、指標は「人の行動」に翻訳し、専門用語を避ける。
 * 入出力のみに依存(I/O なし)させ、テスト容易性とカバレッジを確保する。
 */

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
}

const MAX_TOP_ACTIONS = 3;

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
  if (input.reportUrl) lines.push(`レポートを見る → ${input.reportUrl}`);
  if (input.approveUrl) lines.push(`承認する → ${input.approveUrl}`);

  return lines.join("\n");
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
