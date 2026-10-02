import { COURT_PRICES, type CourtPriceRow } from "@/constants/pricing";

export interface CourtPriceRange {
  min: string;
  max: string;
}

const toAmount = (price: string): number => Number(price.replace(/[^0-9]/g, ""));

/** 非会員の平日・週末料金の最小と最大を、定数の表記のまま返す。 */
export function courtPriceRange(
  rows: readonly CourtPriceRow[] = COURT_PRICES,
): CourtPriceRange {
  const prices = rows.flatMap((row) => [row.weekday, row.weekend]);
  if (prices.length === 0) throw new Error("COURT_PRICES が空です");
  const sorted = [...prices].sort((a, b) => toAmount(a) - toAmount(b));
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}
