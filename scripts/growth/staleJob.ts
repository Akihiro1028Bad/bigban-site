/**
 * pull型ループ共通の stale-lock 判定(純ロジック・DOM/IO 非依存)。
 *
 * 各機能(revise/advise/decorate/eyecatch再生成/本文画像再生成/advise-apply/本文コメント)は
 * Notion の「○○ステータス」で進行を表す。ここでは「reaper が失敗へ回収すべき行」を一元判定する。
 *
 * 回収対象は **処理中**(PC が処理中に落ちた)に加え **依頼中**(PC が拾う前に止まった＝C2 止血)。
 * いずれも `requestedAt` から timeoutMs を超過したものだけ。**提示中**(正常な人待ち)は決して回収しない
 * (#H29: 以前 bodyComment だけ status 条件が無く提示中を誤って失敗化していた回帰を防ぐ)。
 */

/** reaper 回収対象とみなす進行中ステータス。提示中・失敗・なし は含めない。 */
const REAPABLE_STATUSES: readonly string[] = ["処理中", "依頼中"];

/** reaper 判定に必要な最小形状(各ループの行型が満たす)。 */
export interface StaleJobRow {
  status: string;
  /** 依頼時刻(ms)。null は依頼時刻未記録＝誤回収を避けるため対象外。 */
  requestedAtMs: number | null;
}

/** 行が stale(=reaper が失敗化すべき)か。 */
export function isStaleJobRow(row: StaleJobRow, nowMs: number, timeoutMs: number): boolean {
  return (
    REAPABLE_STATUSES.includes(row.status) &&
    row.requestedAtMs !== null &&
    nowMs - row.requestedAtMs > timeoutMs
  );
}

/** stale な行の id を返す。 */
export function selectStaleJobIds<T extends StaleJobRow & { id: string }>(
  rows: readonly T[],
  nowMs: number,
  timeoutMs: number
): string[] {
  return rows.filter((r) => isStaleJobRow(r, nowMs, timeoutMs)).map((r) => r.id);
}
