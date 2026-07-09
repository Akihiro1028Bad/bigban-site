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
