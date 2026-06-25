/**
 * 承認画面のキーボード操作(#109)の純ロジック。DOM 非依存。
 *
 * キー → アクションの対応表と、フォーカス移動のインデックス計算を提供する。
 * document へのリスナ結線は ApproveClient 側。
 */

export type ShortcutAction =
  | "approve" // a: 承認
  | "reject" // r: 却下
  | "edit" // e: 編集
  | "next" // j: 次のカードへ
  | "prev" // k: 前のカードへ
  | "search" // /: 検索へフォーカス
  | "palette" // ⌘K / Ctrl+K: コマンドパレット
  | "escape"; // Esc: 閉じる/解除

/**
 * キー入力を操作に解決する。修飾キー付きは ⌘/Ctrl+K のみ palette、他は無視(null)。
 */
export function resolveShortcut(
  key: string,
  meta: boolean,
  ctrl: boolean,
): ShortcutAction | null {
  if (meta || ctrl) {
    return key.toLowerCase() === "k" ? "palette" : null;
  }
  switch (key) {
    case "j":
      return "next";
    case "k":
      return "prev";
    case "a":
      return "approve";
    case "r":
      return "reject";
    case "e":
      return "edit";
    case "/":
      return "search";
    case "Escape":
      return "escape";
    default:
      return null;
  }
}

/** 入力欄(input/textarea/select)か。編集中は単一キーのショートカットを抑止する。 */
export function isEditableTag(tagName: string): boolean {
  const t = tagName.toUpperCase();
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
}

/** インデックスを [0, len-1] に丸める。空(len<=0)は -1。 */
export function clampIndex(index: number, len: number): number {
  if (len <= 0) return -1;
  return Math.max(0, Math.min(index, len - 1));
}

/** フォーカスを delta だけ動かす。未選択(idx<0)は先頭から数える。空は -1。 */
export function moveIndex(index: number, delta: number, len: number): number {
  if (len <= 0) return -1;
  const base = index < 0 ? 0 : index;
  return clampIndex(base + delta, len);
}
