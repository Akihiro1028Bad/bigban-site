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

/**
 * wedge 行(#220-4): busy(処理中/依頼中)なのに `requestedAt` が無い行。
 * 依頼時刻が無いと {@link isStaleJobRow} は時間判定できず永久に reap されないため、
 * time-out ではなく「存在」で検知して通知経路に載せる(誤って失敗化はしない)。
 */
export function isWedgeJobRow(row: StaleJobRow): boolean {
  return REAPABLE_STATUSES.includes(row.status) && row.requestedAtMs === null;
}

/** wedge 行(busy かつ依頼時刻なし)の id を返す。 */
export function selectWedgeJobIds<T extends StaleJobRow & { id: string }>(
  rows: readonly T[]
): string[] {
  return rows.filter((r) => isWedgeJobRow(r)).map((r) => r.id);
}

// ── 生成中(drafts)の滞留検知(#220-3)────────────────────────────────
// drafts は pull 型と違い行ごとの `requestedAt` を持たない(prompt が「生成中」を書くだけで
// 次回 drafts 実行が冪等に拾い直す)。そこで reaper で失敗化はせず、Notion の最終更新時刻を
// 時計にして「生成待ち/生成中のまま滞留している」ことだけを検知し、cron 側で通知する。

/** 滞留検知の対象ステータス。承認=生成待ち(拾われる前)、生成中=drafts 実行中に落ちた。 */
const STALLABLE_GENERATING_STATUSES: readonly string[] = ["承認", "生成中"];

/** 滞留判定に必要な最小形状。lastEditedMs は Notion の最終更新時刻(ms)。 */
export interface GeneratingRow {
  status: string;
  /** 最終更新時刻(ms)。null は不明＝誤検知を避けるため対象外。 */
  lastEditedMs: number | null;
}

/** 生成待ち/生成中のまま lastEdited から timeoutMs を超過していれば滞留。 */
export function isStalledGeneratingRow(
  row: GeneratingRow,
  nowMs: number,
  timeoutMs: number
): boolean {
  return (
    STALLABLE_GENERATING_STATUSES.includes(row.status) &&
    row.lastEditedMs !== null &&
    nowMs - row.lastEditedMs > timeoutMs
  );
}

/** 滞留した生成待ち/生成中の行の id を返す。 */
export function selectStalledGeneratingIds<T extends GeneratingRow & { id: string }>(
  rows: readonly T[],
  nowMs: number,
  timeoutMs: number
): string[] {
  return rows.filter((r) => isStalledGeneratingRow(r, nowMs, timeoutMs)).map((r) => r.id);
}
