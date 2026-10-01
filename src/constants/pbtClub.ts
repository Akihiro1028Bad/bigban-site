// PBT CLUB(月額会員制度)の確定値。
// 出典: ニュース記事 pbt-club-membership(2026-08-03 公開、日本語版は 9/17 改稿)。
// コート料金そのものは pricing.ts(COURT_PRICES)が正本。
export const PBT_CLUB_PATH = "/pbt-club";
export const PBT_CLUB_MONTHLY_FEE_YEN = 10000;
export const PBT_CLUB_MONTHLY_HOUR_CAP = 20;
export const PBT_CLUB_ADVANCE_BOOKING_DAYS = { general: 14, member: 30 } as const;
export const PBT_CLUB_POINT_RATE_PERCENT = 2;

// 公開ニュース記事の入会ボタンと同じ LaBOLA の入会ページ。
export const LABOLA_MEMBER_TYPES_URL =
  "https://yoyaku.labola.jp/r/shop/3473/member-types/";
