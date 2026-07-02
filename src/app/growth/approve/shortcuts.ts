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
  | "escape" // Esc: 閉じる/解除
  | "select-toggle" // x: フォーカス/アクティブ行の選択トグル
  | "tab-outline" // 1: 詳細タブを構成案へ
  | "tab-preview" // 2: 詳細タブをプレビューへ
  | "tab-material" // 3: 詳細タブを素材(クラスタ既定リーフ)へ
  | "help"; // ?: ショートカット一覧を開く

/**
 * キー入力を操作に解決する。修飾キー付きは ⌘/Ctrl+K のみ palette、他は無視(null)。
 * `?` は Shift+/ 由来で event.key が "?" として届くため、修飾キー扱いにはしない。
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
    case "x":
      return "select-toggle";
    case "/":
      return "search";
    case "1":
      return "tab-outline";
    case "2":
      return "tab-preview";
    case "3":
      return "tab-material";
    case "?":
      return "help";
    case "Escape":
      return "escape";
    default:
      return null;
  }
}

/**
 * モーダル/オーバーレイ開放中に単一キー操作を盤へ漏らさないためのガード純関数。
 * proto(`approve-proto/page.tsx:908`) の「モーダル開放中は単一キーを全抑止」相当。
 *
 * palette と escape は抑止しない(パレット自体の操作/Esc での閉じるを妨げないため)。
 * それ以外の action は、いずれかのオーバーレイが開いている間は true(=抑止)を返す。
 */
export function shouldBlockSingleKeys(
  hasOpenOverlay: boolean,
  action: ShortcutAction,
): boolean {
  if (action === "palette" || action === "escape") return false;
  return hasOpenOverlay;
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
