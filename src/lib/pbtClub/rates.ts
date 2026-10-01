import { PBT_CLUB_MONTHLY_FEE_YEN } from "@/constants/pbtClub";
import { COURT_PRICES } from "@/constants/pricing";

import { buildRateRows, summarizeRates } from "./breakeven";

// 料金表(COURT_PRICES)から導く、PBT CLUB ページ共通の行と集計。
// 料金が変われば損益分岐も自動で追従する。
export const PBT_CLUB_RATE_ROWS = buildRateRows(
  COURT_PRICES,
  PBT_CLUB_MONTHLY_FEE_YEN,
);
export const PBT_CLUB_RATE_SUMMARY = summarizeRates(PBT_CLUB_RATE_ROWS);

// 通常料金が最も高い行(平日夜・土日祝)。月の比較例と「向かない方」の目安に使う。
export const PBT_CLUB_PEAK_ROW = [...PBT_CLUB_RATE_ROWS].sort(
  (a, b) => b.normalYen - a.normalYen,
)[0];

// 月の支払額の比較例で見せる利用時間(公開記事の比較例と同じ)。
export const PBT_CLUB_COMPARISON_HOURS = [4, 5, 8] as const;
