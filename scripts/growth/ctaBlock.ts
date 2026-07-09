/**
 * CTA(<a class="cta">ボタン)構造化ロジック(#182後続の宛先プリセット/TipTapノード/AIが依存)。
 *
 * DOM に依存しない純ロジック。headless(AI ループ) とエディタ UI の双方から `src/lib/growth/ctaBlock`
 * 経由で共有する。
 */

export type CtaVariant = "primary" | "ghost";

export interface Cta {
  label: string;
  href: string;
  variant: CtaVariant;
}

/** タグを除いた文字列(空白畳み込み)。 */
function plainText(fragment: string): string {
  return fragment.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** class 属性値から href/label/variant を組み立てる。 */
function buildCta(tag: string, classes: string, innerHtml: string): Cta {
  const hrefMatch = tag.match(/\bhref=("([^"]*)"|'([^']*)')/i);
  const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim();
  const variant: CtaVariant = /\bcta--ghost\b/.test(classes) ? "ghost" : "primary";
  return { label: plainText(innerHtml), href, variant };
}

/** class="cta[ cta--ghost]" を直接持つ <a> を探す(現行フォーマット)。 */
function matchCtaAnchor(html: string): Cta | null {
  const match = html.match(/<a\b[^>]*\bclass=("[^"]*"|'[^']*')[^>]*>([\s\S]*?)<\/a>/i);
  if (!match) return null;

  const classes = match[1].slice(1, -1);
  if (!/\bcta\b/.test(classes)) return null;

  return buildCta(match[0], classes, match[2]);
}

/** class="cta" を持つ div ラッパの中の <a> を探す(旧フォーマットの後方互換)。 */
function matchCtaWrapper(html: string): Cta | null {
  const wrapperMatch = html.match(/<div\b[^>]*\bclass=("[^"]*"|'[^']*')[^>]*>([\s\S]*?)<\/div>/i);
  if (!wrapperMatch) return null;

  const classes = wrapperMatch[1].slice(1, -1);
  if (!/\bcta\b/.test(classes)) return null;

  const anchorMatch = wrapperMatch[2].match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
  if (!anchorMatch) return null;

  return buildCta(anchorMatch[0], classes, anchorMatch[1]);
}

/** CTA の <a class="cta[ cta--ghost]" href>label</a>(p/div.cta ラップ可)を構造化する。CTA でなければ null。 */
export function parseCta(html: string): Cta | null {
  return matchCtaAnchor(html) ?? matchCtaWrapper(html);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cta を正準 CTA HTML に直列化する(parseCta の逆変換)。サニタイザ(STRICT)往復で保持される形。 */
export function serializeCta(cta: Cta): string {
  const cls = cta.variant === "ghost" ? "cta cta--ghost" : "cta";
  return `<a class="${cls}" href="${escapeHtml(cta.href)}">${escapeHtml(cta.label)}</a>`;
}

export interface CtaDestination {
  key: string;
  label: string;
  url: string;
}

// CTA 宛先の単一ソース(canon・オーナー確認済み 2026-07-09)。予約は内部 /reserve ページ経由で
// RESERVA(7月)→labola(8月)の切替を吸収するため、8月切替時に CTA URL を直す必要はない(/reserve が吸収)。
export const CTA_DESTINATIONS: readonly CtaDestination[] = [
  { key: "reserve", label: "予約", url: "https://www.thepicklebang.com/reserve" },
  { key: "instagram", label: "公式Instagram", url: "https://www.instagram.com/thepicklebangtheory/" },
  { key: "access", label: "アクセス（施設案内）", url: "https://www.thepicklebang.com/about" },
  { key: "contact", label: "問い合わせ", url: "https://www.thepicklebang.com/#contact" },
  { key: "top", label: "公式サイト", url: "https://www.thepicklebang.com/" },
];

/** CTA の文言必須・href 形式(http(s) 完全URL または内部パス/アンカー)を検証する。 */
export function validateCta(cta: Cta): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (cta.label.trim() === "") errors.push("文言を入力してください");
  const href = cta.href.trim();
  const valid = /^https?:\/\/\S+$/.test(href) || /^\/[^\s]*$/.test(href);
  if (!valid) errors.push("リンク先の形式が不正です");
  return { ok: errors.length === 0, errors };
}
