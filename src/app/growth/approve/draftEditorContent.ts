/**
 * 下書きリッチエディタ(#77)の純ロジック。
 * - 読み込み/保存時のサニタイズ(エディタの入出力を本文サニタイザの許可リストに収める)
 * - 保存ペイロード組み立て
 * - クラス装飾カタログ(ツールバーの「装飾」ドロップダウン用データ)
 *
 * TipTap(DOM 結線)に依存しないためテスト可能。DOM 結線は DraftEditor.tsx(カバレッジ除外)。
 */

import { sanitizeNewsHtml, STRICT_HTML_CONFIG } from "@/lib/news/sanitize";

/**
 * エディタの入出力 HTML を本文サニタイザ(STRICT)で正規化する。
 * - 読み込み時: 既存 bodyHtml を許可リストに収めてからエディタへ渡す。
 * - 保存時: エディタ出力を再度通す(サーバ側 #76 でも再サニタイズ=多層防御)。
 */
export function sanitizeDraftHtml(html: string): string {
  return sanitizeNewsHtml(html, STRICT_HTML_CONFIG);
}

export interface DraftEditPayload {
  pageId: string;
  bodyHtml: string;
}

/** 保存APIへ送るペイロードを組み立てる(本文は許可リストに正規化)。 */
export function buildDraftEditPayload(pageId: string, html: string): DraftEditPayload {
  return { pageId, bodyHtml: sanitizeDraftHtml(html) };
}

/** クラス装飾(本文サニタイザの許可クラスのうち、エディタから付けられるもの)。 */
export interface DraftDecoration {
  className: string;
  label: string;
}

export const DRAFT_DECORATIONS: readonly DraftDecoration[] = [
  { className: "lead", label: "リード文" },
  { className: "note", label: "ノート" },
  { className: "caution", label: "注意" },
  { className: "badge", label: "バッジ" },
  { className: "highlight", label: "ハイライト" },
];
