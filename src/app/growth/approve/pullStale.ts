/**
 * pull型(依頼→別PCが処理→提示)の「経過時間と滞留」表示の純ロジック。DOM/IO 非依存。
 *
 * 画面は依頼中/処理中のあいだ経過時間を出し、しきい値を超えたら「自宅PCの巡回が
 * 止まっている疑い」を控えめに警告する(C2 の止血をユーザー側でも可視化する)。
 * reaper の回収しきい値(15分)と揃える。
 */

/** 滞留(自宅PC停止の疑い)とみなす既定しきい値。reaper の TIMEOUT と一致させる。 */
export const PULL_STALE_THRESHOLD_MS = 15 * 60 * 1000;

export interface PullStaleView {
  /** 依頼からの経過(分・切り捨て)。 */
  minutes: number;
  /** しきい値超で滞留(警告表示)。 */
  stuck: boolean;
}

/**
 * busy(依頼中/処理中)かつ依頼時刻ありのときだけ経過＋滞留を返す。
 * それ以外(非busy・依頼時刻なし)は null=非表示。負の経過(時計ズレ)は 0 に丸める。
 */
export function pullStaleView(
  requestedAtMs: number | null,
  nowMs: number,
  thresholdMs: number,
  busy: boolean
): PullStaleView | null {
  if (!busy || requestedAtMs === null) return null;
  const elapsed = Math.max(0, nowMs - requestedAtMs);
  return { minutes: Math.floor(elapsed / 60_000), stuck: elapsed > thresholdMs };
}
