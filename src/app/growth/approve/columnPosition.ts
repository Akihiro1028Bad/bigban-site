/**
 * 記事カンバン(横スクロール)の現在表示列を求める純ロジック(#137)。DOM 非依存。
 * モバイルのスワイプ位置インジケータ(ドット)のハイライト対象を決める。
 */

/**
 * scrollLeft / 全体スクロール幅 / 列数 から、最も表示されている列の index を返す。
 * 列数1以下・幅0ではゼロ除算を避けて常に 0。結果は [0, columnCount-1] にクランプ。
 */
export function activeColumnIndex(
  scrollLeft: number,
  scrollWidth: number,
  columnCount: number,
): number {
  if (columnCount <= 1 || scrollWidth <= 0) return 0;
  const stride = scrollWidth / columnCount;
  const index = Math.round(scrollLeft / stride);
  return Math.max(0, Math.min(columnCount - 1, index));
}
