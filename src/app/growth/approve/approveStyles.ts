/** 承認画面で共有するボタン等のタップターゲット用クラス(#H7 分解で共有化)。 */
export const TAP_TARGET =
  "min-h-11 min-w-11 px-4 rounded-md text-sm font-medium transition-colors";

/** 承認/却下等の選択ボタンの共通クラス(activeClass で配色を差し替え)。 */
export function choiceButtonClass(activeClass: string): string {
  return `${TAP_TARGET} ${activeClass} disabled:opacity-50`;
}
