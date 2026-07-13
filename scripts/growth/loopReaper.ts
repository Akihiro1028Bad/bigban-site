import { selectStaleJobIds, type StaleJobRow } from "./staleJob";

/** stale行だけを順番に決定的な失敗化処理へ渡す、pull型ループ共通オーケストレーション。 */
export async function reapStaleRows<T extends StaleJobRow & { id: string }>(
  rows: readonly T[],
  nowMs: number,
  timeoutMs: number,
  onReap: (row: T) => Promise<void>
): Promise<void> {
  const staleIds = new Set(selectStaleJobIds(rows, nowMs, timeoutMs));
  for (const row of rows) {
    if (staleIds.has(row.id)) await onReap(row);
  }
}
