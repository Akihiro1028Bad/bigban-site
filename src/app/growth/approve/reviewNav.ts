/**
 * 連続レビュー(#130)の純ロジック。DOM 非依存。
 * 現在の記事から、並び順上の「次/前の未処理(actionable)記事」の id を決める。
 */

export interface ReviewEntry {
  id: string;
  actionable: boolean;
}

/**
 * order 内の currentId から dir(+1=次 / -1=前)方向に走査し、最初の actionable な id を返す。
 * 見つからない(末尾/先頭)・current が order に無い場合は null。
 */
export function nextReviewId(
  order: ReviewEntry[],
  currentId: string,
  dir: 1 | -1,
): string | null {
  const idx = order.findIndex((entry) => entry.id === currentId);
  if (idx < 0) return null;
  for (let i = idx + dir; i >= 0 && i < order.length; i += dir) {
    if (order[i].actionable) return order[i].id;
  }
  return null;
}
