/**
 * 承認画面 fixed モーダル共通の onKeyDown ヘルパ(#proto P6 / Esc 統一)。
 *
 * useDialog(フォーカストラップ)と併用し、各モーダルの dialog root へ付ける:
 *  - Escape        → 伝播を止めて onClose を呼ぶ(自前 Esc で閉じる。CommandPalette と同 idiom)。
 *  - 修飾なし単一キー → 伝播だけ止める(モーダル内で押した a/j 等が window の中央 keydown へ
 *    漏れて盤に作用するのを防ぐ)。既定動作・focus-trap(useDialog)は妨げない。
 *  - Tab / 修飾キー付き / input への通常入力 → 何もしない(stopPropagation は伝播のみを止める)。
 *
 * 純関数(DOM/フックに依存しない)ため単体テスト可能。
 */
import type { KeyboardEvent } from "react";

/** 修飾キー(⌘/Ctrl/Alt)が押されているか。 */
function hasModifier(e: KeyboardEvent<HTMLElement>): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}

/**
 * モーダル dialog root の onKeyDown。Escape で閉じ、それ以外の修飾なし単一キーは
 * 伝播だけ止めて中央 keydown への漏れを防ぐ。
 */
export function handleOverlayKeyDown(
  e: KeyboardEvent<HTMLElement>,
  onClose: () => void,
): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    onClose();
    return;
  }
  // Tab はフォーカストラップ(useDialog)へ委ねる。修飾キー付き(⌘K 等)は中央処理へ通す。
  if (e.key === "Tab" || hasModifier(e)) return;
  // 修飾なし単一キー(a/j/1 等)がモーダル外の window keydown へ漏れて盤に作用するのを防ぐ。
  // stopPropagation は伝播のみを止め、input への通常入力(既定動作)は妨げない。
  e.stopPropagation();
}
