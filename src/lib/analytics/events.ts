/**
 * グロースループ計測の key イベント定義(#計測強化 S1)。
 *
 * PV ではなく「来店・予約に近い行動」を計測するための GA4 イベント名と、
 * 送信パラメータの整形ヘルパ。GA4 管理画面で各イベントを「キーイベント」化することで
 * `growth:fetch` / `growth:metrics` の keyEvents が 0 を脱却する。
 * 実送信は trackEvent.ts(gtag/dataLayer の薄い I/O)が担い、ここは純ロジック(テスト対象)。
 */

/** CTA クリックの key イベント名(GA4 でキーイベント化する対象)。 */
export const CTA_EVENTS = {
  instagram: "instagram_click",
  line: "line_click",
  reservation: "reservation_click",
  access: "access_click",
  price: "price_click",
  newsCta: "news_cta_click",
} as const;

export type CtaKey = keyof typeof CTA_EVENTS;

/**
 * クリック計測のパラメータを組み立てる。location=設置箇所(分析の切り口)、
 * label=任意の補助ラベル(記事タイトル等)。空の label は付けない。
 */
export function ctaEventParams(location: string, label?: string): Record<string, string> {
  return label ? { location, label } : { location };
}

/**
 * フォーム値(FormData は string | File)を label 用の文字列へ正規化する。
 * 非文字列・空文字は undefined(=label を付けない)。
 */
export function formEntryLabel(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
