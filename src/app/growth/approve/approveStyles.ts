/** 承認画面で共有するボタン等のタップターゲット用クラス(#H7 分解で共有化)。 */
export const TAP_TARGET =
  "min-h-11 min-w-11 px-4 rounded-md text-sm font-medium transition-colors";

/** 詳細パネル等のセクションカード/見出しスタイル。 */
export const SECTION_CARD = "rounded-lg border border-gray-200 bg-white p-3";
export const SECTION_HEAD = "text-sm font-bold text-gray-700";

/** 承認/却下等の選択ボタンの共通クラス(activeClass で配色を差し替え)。 */
export function choiceButtonClass(activeClass: string): string {
  return `${TAP_TARGET} ${activeClass} disabled:opacity-50`;
}
