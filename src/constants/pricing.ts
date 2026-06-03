// コートレンタル料金（HomePricing / HyroxProgram で共有）。
export interface CourtPriceRow {
  timeSlot: string;
  weekday: string;
  weekend: string;
}

export const COURT_PRICES: readonly CourtPriceRow[] = [
  { timeSlot: "6:00-9:00", weekday: "¥4,980", weekend: "¥7,980" },
  { timeSlot: "9:00-17:00", weekday: "¥5,980", weekend: "¥7,980" },
  { timeSlot: "17:00-23:00", weekday: "¥7,980", weekend: "¥7,980" },
];
