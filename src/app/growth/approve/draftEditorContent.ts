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

/**
 * ツールバーの装飾(#179)。種別ごとに付け方が異なる:
 * - block      … 段落を `<aside class="...">` で包むコールアウト(note/caution/highlight)。
 *                 装飾アシスタント #147 の `applyDecoration` と同一の HTML にして表示を一致させる。
 * - paragraph  … 現在の段落に `class="lead"` を付ける(リード文)。
 * - inline     … 選択範囲に `<span class="badge">` / `<mark>` を付ける。
 *
 * `sampleHtml` は反映後 HTML の代表例。本文サニタイザ(STRICT)を往復しても装飾が
 * 消えないこと(=エディタで付けた装飾が保存後も残ること)をテストで担保する。
 */
export type DecorationKind = "block" | "paragraph" | "inline";

export type DecorationKey =
  | "lead"
  | "note"
  | "caution"
  | "highlight"
  | "badge"
  | "mark";

export interface DecorationOption {
  key: DecorationKey;
  label: string;
  kind: DecorationKind;
  sampleHtml: string;
}

export const DECORATION_OPTIONS: readonly DecorationOption[] = [
  { key: "lead", label: "リード文", kind: "paragraph", sampleHtml: '<p class="lead">本文</p>' },
  { key: "note", label: "ノート", kind: "block", sampleHtml: '<aside class="note"><p>本文</p></aside>' },
  { key: "caution", label: "注意", kind: "block", sampleHtml: '<aside class="caution"><p>本文</p></aside>' },
  { key: "highlight", label: "ハイライト", kind: "block", sampleHtml: '<aside class="highlight"><p>本文</p></aside>' },
  { key: "badge", label: "バッジ", kind: "inline", sampleHtml: '<p><span class="badge">本文</span></p>' },
  { key: "mark", label: "インライン強調", kind: "inline", sampleHtml: "<p><mark>本文</mark></p>" },
];
