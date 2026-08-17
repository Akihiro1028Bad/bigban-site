// 正典: src/lib/analytics/events.ts の CTA_EVENTS。クラウド実行(素の node)のため
// TS を import せず値を複製し、同期は scripts/analytics/ctaEvents.test.ts が保証する。
// query.mjs 本体ではなくこの小モジュールに置くのは、テストが CLI 全体を読み込まずに
// 値だけを検証できるようにするため。
export const CTA_EVENTS = [
  "instagram_click",
  "line_click",
  "reservation_click",
  "reserve_entry_click",
  "contact_submit",
  "newsletter_signup",
  "external_link_click",
  "content_click",
  "access_click",
  "price_click",
  "news_cta_click",
];
