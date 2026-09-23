// コートレンタル料金（HomePricing / HyroxProgram で共有）。
// weekdayMember / weekendMember は月額会員制度「PBT CLUB」の会員価格（税込）。
// 出典: 2026-08-03 公開のニュース記事（slug: pbt-club-membership）。
export interface CourtPriceRow {
  timeSlot: string;
  weekday: string;
  weekdayMember: string;
  weekend: string;
  weekendMember: string;
}

export const COURT_PRICES: readonly CourtPriceRow[] = [
  {
    timeSlot: "6:00-9:00",
    weekday: "¥4,980",
    weekdayMember: "¥3,500",
    weekend: "¥7,980",
    weekendMember: "¥5,600",
  },
  {
    timeSlot: "9:00-17:00",
    weekday: "¥5,980",
    weekdayMember: "¥4,200",
    weekend: "¥7,980",
    weekendMember: "¥5,600",
  },
  {
    timeSlot: "17:00-23:00",
    weekday: "¥7,980",
    weekdayMember: "¥5,600",
    weekend: "¥7,980",
    weekendMember: "¥5,600",
  },
];

// HYROX のレッスン・クラス料金（1回あたり・税込）と所要時間。
// 説明文・構造化データ(priceRange)などはここを参照し、文言に金額を直書きしない。
// 出典: ニュース hyrox-morning-trial-class-2026 / LaBOLA レッスン・クラス一覧(2026-09-23)。
export interface HyroxLessonPrice {
  minutes: number;
  priceYen: number;
}

export const HYROX_LESSON_PRICES = {
  trial: { minutes: 50, priceYen: 3000 },
  morningClass: { minutes: 60, priceYen: 3000 },
  daisukeClass: { minutes: 60, priceYen: 4500 },
} as const satisfies Record<string, HyroxLessonPrice>;
