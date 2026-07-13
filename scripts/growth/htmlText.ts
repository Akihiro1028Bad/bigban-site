/**
 * アンカー照合用の共通テキスト正規化。
 *
 * 目的: AI が返す「引用(表示テキスト)」と、DOMPurify で直列化された本文 HTML を
 * 同じ土俵で比較できるようにする。両者は次の点で構造的にズレるため、単純な
 * タグ除去＋空白畳みだけでは高頻度で不一致になる:
 *  - 本文 HTML はテキスト中の & < > " が実体参照(&amp; 等)に符号化される
 *  - &nbsp; / ゼロ幅などの空白類、<br> 由来の改行
 *  - 全角/半角・互換文字の表記ゆれ
 *
 * デコード対象を最小限にし、DOM に依存しない純文字列処理にする(ブラウザ/Node 両対応)。
 * advise-apply / decorate の両ループで共有する(単一ソース)。
 */

/** 名前付き実体参照の最小セット(DOMPurify 出力＋一般的なもの)。 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};

/** すべての空白類(NBSP・ゼロ幅・行区切り等)を畳む対象。 */
const WHITESPACE_RE = /[\s ​‌‍﻿]+/g;

/** HTML 実体参照(名前付き＋10進/16進数値)を実文字へデコードする。未知/不正はそのまま残す。 */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#(?:x|X)?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint < 1 || codePoint > 0x10ffff) return match;
      return String.fromCodePoint(codePoint);
    }
    const named = NAMED_ENTITIES[body];
    return named ?? match;
  });
}

/**
 * アンカー照合用の正規化テキストを返す。
 * 手順: <br> を空白化 → タグ除去 → 実体参照デコード → 空白畳み・トリム → Unicode 正規化(NFKC)。
 * NFKC は全半角・互換文字を寄せて一致率を上げる(誤適用は呼び出し側の一意性チェックで防ぐ)。
 */
function normalizeWhitespaceAndCompatibility(text: string): string {
  return text.replace(WHITESPACE_RE, " ").trim().normalize("NFKC");
}

/** 本文 HTML を表示テキストへ変換して正規化する。 */
export function normalizeHtmlAnchorText(html: string): string {
  const spaced = html.replace(/<br\s*\/?>/gi, " ");
  const withoutTags = spaced.replace(/<[^>]*>/g, "");
  const decoded = decodeHtmlEntities(withoutTags);
  return normalizeWhitespaceAndCompatibility(decoded);
}

/** AI が返す引用・抜粋などのプレーンテキストを正規化する。 */
export function normalizePlainAnchorText(text: string): string {
  return normalizeWhitespaceAndCompatibility(text);
}
