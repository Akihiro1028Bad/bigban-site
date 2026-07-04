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

/**
 * 下書き本文の文字数を数える(フッタ常時表示用・#UI)。
 *
 * 入力は TipTap の `editor.getText()`(タグ無しのプレーンテキスト)想定。
 * DetailPanel の `bodyCharCount`(タグ除去 → 連続空白を 1 に畳む → trim → `.length`)と
 * 同じ正規化を行い、両者の文字数が矛盾しないようにする。日本語(サロゲート無し文字)は
 * `.length` で概ね字数と一致する。
 */
export function countDraftCharacters(text: string): number {
  return text.replace(/\s+/g, " ").trim().length;
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
 * 保持ブロック(#77・画像/表/埋め込み/CTA/スケジュール)の種別。
 * カード表示(#P2)で種別アイコン・ラベル・補足文を出すために、保持した outerHTML から
 * 先頭要素の種別を判定する純ロジック。DOM に依存せず(正規表現)テスト可能。
 */
export type PreservedBlockKind =
  | "pending"
  | "image"
  | "figure"
  | "table"
  | "cta"
  | "schedule"
  | "embed"
  | "unknown";

export interface PreservedBlockInfo {
  kind: PreservedBlockKind;
  /** カードに出す種別ラベル(日本語)。 */
  label: string;
  /** カードに出す補足文(差し替え導線の案内など)。 */
  hint: string;
}

const PRESERVED_BLOCK_LABELS: Record<PreservedBlockKind, { label: string; hint: string }> = {
  pending: { label: "AI画像を生成中…（完了すると自動で差し替わります）", hint: "削除のみできます" },
  image: { label: "画像", hint: "差し替えは『素材』タブから" },
  figure: { label: "図表", hint: "差し替えは『素材』タブから" },
  table: { label: "表", hint: "内容の編集は次の更新で対応予定" },
  cta: { label: "CTA", hint: "文言・リンクの編集は次の更新で対応予定" },
  schedule: { label: "スケジュール", hint: "内容の編集は次の更新で対応予定" },
  embed: { label: "埋め込み", hint: "差し替えは元の投稿リンクから" },
  unknown: { label: "ブロック", hint: "移動・削除のみできます" },
};

/**
 * 保持ブロックの outerHTML から種別を判定する。
 * PRESERVE_SELECTORS(figure/table/div.cta/div.schedule/a.embed)に対応し、
 * figure は内側に <img> があれば "image"、無ければ "figure" に分ける。
 */
export function classifyPreservedBlock(html: string): PreservedBlockInfo {
  const trimmed = html.trim();
  const kind = detectPreservedKind(trimmed);
  const { label, hint } = PRESERVED_BLOCK_LABELS[kind];
  return { kind, label, hint };
}

function detectPreservedKind(html: string): PreservedBlockKind {
  const head = html.slice(0, 200).toLowerCase();
  if (/^<figure[\s>]/.test(head)) {
    if (/\sdata-pending=(?:"[^"]*"|'[^']*'|[^\s>]+)/.test(head)) return "pending";
    return /<img[\s>]/.test(html.toLowerCase()) ? "image" : "figure";
  }
  if (/^<table[\s>]/.test(head)) return "table";
  if (/^<div[^>]*\bclass="[^"]*\bcta\b/.test(head)) return "cta";
  if (/^<div[^>]*\bclass="[^"]*\bschedule\b/.test(head)) return "schedule";
  if (/^<a[^>]*\bclass="[^"]*\bembed\b/.test(head)) return "embed";
  return "unknown";
}

/**
 * 保持ブロック内の先頭 `<img>` の `src` 属性だけを差し替える。
 * TipTap の preservedBlock.attrs.html 更新用。置換値に `$1` 等が含まれても
 * RegExp 置換の展開を起こさないよう、関数形式で返す。
 */
export function replaceImgSrcInHtml(html: string, newUrl: string): string {
  return html.replace(/(<img\b[^>]*\bsrc=)(["'])([^"']*)(\2)/i, (_match, prefix, quote, _src, suffix) => {
    const safePrefix = typeof prefix === "string" ? prefix : "";
    const safeQuote = typeof quote === "string" ? quote : '"';
    const safeSuffix = typeof suffix === "string" ? suffix : safeQuote;
    return `${safePrefix}${safeQuote}${newUrl}${safeSuffix}`;
  });
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
