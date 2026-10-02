export const NEWS_CATEGORIES = [
  { id: "notice", labelJa: "お知らせ", labelEn: "Notice", color: "#C8FF00" },
  { id: "media", labelJa: "メディア掲載", labelEn: "Media", color: "#8AB4FF" },
  { id: "event", labelJa: "イベント情報", labelEn: "Event", color: "#FF6A3D" },
  { id: "campaign", labelJa: "キャンペーン", labelEn: "Campaign", color: "#F6FF54" },
] as const;

export type NewsCategoryId = (typeof NEWS_CATEGORIES)[number]["id"];

export const NEWS_PAGE_SIZE = 12;
export const ABOUT_NEWS_LIMIT = 3;
export const DETAIL_PAGE_STATIC_LIMIT = 100;

/** 英語ホームの最新ニュース帯を出す条件: 公開からこの日数以内の記事が1本以上あること。 */
export const LATEST_NEWS_FRESH_DAYS = 30;
