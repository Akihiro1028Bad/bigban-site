/**
 * グロースループ計測の key イベント定義(#計測強化 S1)。
 *
 * PV ではなく「来店・予約に近い行動」を計測するための GA4 イベント名と、
 * 送信パラメータの整形ヘルパ。GA4 管理画面で各イベントを「キーイベント」化することで
 * `growth:fetch` / `growth:metrics` の keyEvents が 0 を脱却する。
 * 実送信は trackEvent.ts(gtag/dataLayer の薄い I/O)が担い、ここは純ロジック(テスト対象)。
 */

/** CTAイベント名の単一ソース(旧 scripts/growth/ctaEvents.ts から移設)。 */
export const CTA_EVENTS = {
  instagram: "instagram_click",
  line: "line_click",
  reservation: "reservation_click",
  reserveEntry: "reserve_entry_click",
  contactSubmit: "contact_submit",
  newsletterSignup: "newsletter_signup",
  externalLink: "external_link_click",
  contentClick: "content_click",
  access: "access_click",
  price: "price_click",
  newsCta: "news_cta_click",
} as const;

export type CtaKey = keyof typeof CTA_EVENTS;

export interface CtaEventContext {
  articleSlug?: string;
}

const ARTICLE_SLUG_RE = /^[a-z0-9-]{1,100}$/;
const PRODUCTION_SITE_HOST = "www.thepicklebang.com";
const RESERVATION_SERVICE_HOSTS = new Set(["reserva.be", "yoyaku.labola.jp"]);
const RESERVE_PATH_RE = /^\/(?:en\/)?reserve\/?$/;

/**
 * クリック計測のパラメータを組み立てる。location=設置箇所(分析の切り口)、
 * label=任意の補助ラベル(記事タイトル等)。空の label は付けない。
 */
export function ctaEventParams(
  location: string,
  label?: string,
  context?: CtaEventContext,
): Record<string, string> {
  return {
    location,
    ...(label ? { label } : {}),
    ...(context?.articleSlug && ARTICLE_SLUG_RE.test(context.articleSlug)
      ? { article_slug: context.articleSlug }
      : {}),
  };
}

/**
 * サニタイズ済み記事本文のリンクを、既存CTAイベントへ分類する。
 * URLやリンク文言は返さず、送信対象をイベント名だけに限定してPII混入を防ぐ。
 */
export function articleBodyCtaKey(
  href: string,
  pageOrigin: string,
): "reserveEntry" | "reservation" | "externalLink" | null {
  try {
    const pageUrl = new URL(pageOrigin);
    const url = new URL(href, pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const isOfficialSite =
      url.hostname === pageUrl.hostname || url.hostname === PRODUCTION_SITE_HOST;
    if (isOfficialSite) {
      return RESERVE_PATH_RE.test(url.pathname) ? "reserveEntry" : null;
    }
    if (RESERVATION_SERVICE_HOSTS.has(url.hostname)) return "reservation";
    return "externalLink";
  } catch {
    return null;
  }
}

/**
 * フォーム値(FormData は string | File)を label 用の文字列へ正規化する。
 * 非文字列・空文字は undefined(=label を付けない)。
 */
export function formEntryLabel(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
