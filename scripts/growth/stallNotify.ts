/**
 * 滞留検知の LINE 通知本文(#220 / P1⑥・#220-3/#220-4)。純ロジック。
 *
 * - 生成待ち/生成中のまま止まっている記事(drafts 実行中に PC が落ちた等)
 * - busy(処理中/依頼中)なのに依頼時刻が無く、時間で reap できない wedge 行
 *
 * どちらも「気づけない失敗」なので、cron 側の巡回で検知して1通にまとめて通知する。
 * 対象行の抽出は staleJob.ts(テスト済み)、送信は stall-check CLI。
 */

export interface StallMessageInput {
  /** 滞留した生成待ち/生成中の記事タイトル。 */
  generatingTitles: readonly string[];
  /** 依頼時刻ありで timeout を超えた pull 型ループ行。 */
  staleLoopTitles: readonly string[];
  /** wedge(依頼時刻なしで reap 不能)行のタイトル。 */
  wedgeTitles: readonly string[];
  /** 滞留とみなすしきい値(分)。 */
  thresholdMinutes: number;
}

function titleLine(title: string): string {
  return `・${title.trim() || "(無題)"}`;
}

/** 滞留・wedge の LINE 本文。対象が無ければ null(通知不要)。 */
export function buildStallMessage(input: StallMessageInput): string | null {
  const hasGenerating = input.generatingTitles.length > 0;
  const hasStaleLoop = input.staleLoopTitles.length > 0;
  const hasWedge = input.wedgeTitles.length > 0;
  if (!hasGenerating && !hasStaleLoop && !hasWedge) return null;

  const lines = [
    `⚠️ グロースの処理が ${input.thresholdMinutes}分 以上 滞留しています(自宅PCの巡回停止の疑い)。`,
  ];
  if (hasGenerating) {
    lines.push("", "■ 生成待ち/生成中のまま止まっている記事:");
    for (const t of input.generatingTitles) lines.push(titleLine(t));
  }
  if (hasStaleLoop) {
    lines.push("", "■ 依頼時刻からタイムアウトした行(自動回収対象):");
    for (const t of input.staleLoopTitles) lines.push(titleLine(t));
  }
  if (hasWedge) {
    lines.push("", "■ 依頼時刻が無く自動回収できない行(手動確認が必要):");
    for (const t of input.wedgeTitles) lines.push(titleLine(t));
  }
  lines.push("", "自宅PCのタスク(drafts / *-loop)が動いているか確認してください。");
  return lines.join("\n");
}
