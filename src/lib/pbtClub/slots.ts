const SLOT_PATTERN = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

/** 前の時間帯の終わりと次の始まりが同じなら 1 つの範囲にする。読み取れなければ null。 */
function joinSlots(previous: string, next: string): string | null {
  const a = SLOT_PATTERN.exec(previous);
  const b = SLOT_PATTERN.exec(next);
  if (!a || !b) return null;
  if (`${a[3]}:${a[4]}` !== `${b[1]}:${b[2]}`) return null;
  return `${a[1]}:${a[2]}-${b[3]}:${b[4]}`;
}

/**
 * 連続する時間帯("6:00-9:00", "9:00-17:00" → "6:00-17:00")を1つにまとめる。
 * 並び順は渡された順のまま、隣り合う要素だけを結合する。
 * 読み取れない表記は結合せずそのまま残す。
 */
export function mergeContiguousSlots(slots: readonly string[]): string[] {
  const merged: string[] = [];
  for (const slot of slots) {
    const previous = merged.at(-1);
    const joined = previous === undefined ? null : joinSlots(previous, slot);
    if (joined === null) {
      merged.push(slot);
    } else {
      merged[merged.length - 1] = joined;
    }
  }
  return merged;
}
