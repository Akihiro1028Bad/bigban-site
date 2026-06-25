/**
 * 失敗通知の集約・抑制(#58)。
 *
 * 下書きモードが複数記事 / 複数回 publish-draft を回すと、microCMS 劣化時に
 * 同種の失敗通知が短時間に N 通飛んでしまう。同一シグネチャ(工程 + 分類)を
 * 一定ウィンドウ内では1通に集約する純ロジック。
 *
 * 永続化(状態ファイルの読み書き)は呼び出し側(CLI)が担い、ここは I/O を持たない。
 * 状態が壊れていた場合は呼び出し側で「空配列＝必ず送信(fail-open)」に倒すこと
 * (通知の取りこぼし=沈黙 を避けるため)。
 */

/** いつ・どのシグネチャの通知を送ったかの記録。 */
export interface NotifyThrottleRecord {
  signature: string;
  sentAtMs: number;
}

/** 失敗の同一性を表すシグネチャ(工程 + 分類)。 */
export function failureSignature(stage: string, category: string): string {
  return `${stage}:${category}`;
}

export interface ThrottleDecision {
  /** この通知を送るべきか。 */
  send: boolean;
  /** 永続化すべき次の記録(古い記録は剪定済み)。 */
  records: NotifyThrottleRecord[];
}

/**
 * ウィンドウ内に同一シグネチャの通知済み記録があれば抑制する。
 * 古い記録(windowMs 超過)は剪定する。送信する場合は新しい記録を追加して返す。
 */
export function shouldSendFailureNotice(
  records: readonly NotifyThrottleRecord[],
  signature: string,
  nowMs: number,
  windowMs: number
): ThrottleDecision {
  const fresh = records.filter((r) => nowMs - r.sentAtMs < windowMs);
  if (fresh.some((r) => r.signature === signature)) {
    return { send: false, records: fresh };
  }
  return { send: true, records: [...fresh, { signature, sentAtMs: nowMs }] };
}
