import { COURT_PRICES } from "@/constants/pricing";
import { BUSINESS_HOURS_DISPLAY } from "@/constants/site";

export const FIRST_VISIT_PATH = "/first-visit";
export const HYROX_PATH = "/hyrox";

// PBT CLUB への入口。暫定で告知ニュース。#429 の /pbt-club がマージされたらここ1行を切り替える。
export const PBT_CLUB_LINK_PATH = "/news/pbt-club-membership";

// ルール・始め方の確認先(公開済みコラム「ピックルボールの始め方」)。
export const BEGINNER_GUIDE_PATH = "/columns/pickleball-tv-first-step";

// 「ダブルスなら4人で割ると」の例の人数。人数上限の規定ではない。
export const PARTY_SIZE_EXAMPLE = 4;

// 予約の受付開始日(何日前から)。出典: ニュース pbt-club-membership(2026-08-03)。時刻は書かない。
export const BOOKING_WINDOW_DAYS = { general: 14, member: 30 } as const;

// 本文・メタデータに差し込む営業時間(ja は 25:00 表記、それ以外は 12 時間表記)。
// 営業時間の単一ソースは site.ts の BUSINESS_HOURS_DISPLAY。
export function businessHoursValues(locale: string): {
  open: string;
  close: string;
} {
  return locale === "ja" ? BUSINESS_HOURS_DISPLAY.ja : BUSINESS_HOURS_DISPLAY.en;
}

export function parseYen(price: string): number {
  const digits = price.replace(/[^0-9]/g, "");
  if (digits === "") throw new Error(`金額を読み取れません: ${price}`);
  return Number(digits);
}

// 人数で割り、10円単位に丸める(例: 4,980円/4人 = 1,245 → 1,250)。
export function perPersonYen(priceYen: number, partySize: number): number {
  if (!Number.isInteger(partySize) || partySize < 1) {
    throw new RangeError(`人数は1以上の整数: ${partySize}`);
  }
  return Math.round(priceYen / partySize / 10) * 10;
}

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("en-US")}`;
}

export interface PerPersonRow {
  timeSlot: string;
  weekday: string;
  weekend: string;
}

export function perPersonRows(
  partySize: number = PARTY_SIZE_EXAMPLE,
): readonly PerPersonRow[] {
  return COURT_PRICES.map((row) => ({
    timeSlot: row.timeSlot,
    weekday: formatYen(perPersonYen(parseYen(row.weekday), partySize)),
    weekend: formatYen(perPersonYen(parseYen(row.weekend), partySize)),
  }));
}
