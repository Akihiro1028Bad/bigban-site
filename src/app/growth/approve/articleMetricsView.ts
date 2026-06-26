/**
 * 成績ボード(#C4)の表示整形(純ロジック・DOM 非依存)。
 */

export type DeltaTone = "up" | "down" | "flat" | "none";

/** 表示数/ユーザー数を短く整形する(1000以上は k 表記・小数第1位)。 */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10;
  return `${k}k`;
}

/** 前週比(%)を符号・トーン付きで整形する。null は未計測。 */
export function formatDelta(deltaPct: number | null): { text: string; tone: DeltaTone } {
  if (deltaPct === null) return { text: "—", tone: "none" };
  if (deltaPct === 0) return { text: "±0%", tone: "flat" };
  if (deltaPct > 0) return { text: `+${deltaPct}%`, tone: "up" };
  return { text: `${deltaPct}%`, tone: "down" };
}

/** 予約時刻(ms)を環境非依存に整形する(UTC・分まで)。#H24 の予約表示で使う。 */
export function formatScheduledAt(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
