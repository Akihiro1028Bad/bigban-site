import type { CourtPriceRow } from "@/constants/pricing";

/** "¥4,980" → 4980。料金表(pricing.ts)の文字列から数値を導く。 */
export function parseYen(text: string): number {
  const digits = text.replace(/[^0-9]/g, "");
  if (digits === "") throw new Error(`金額を読み取れません: ${text}`);
  return Number(digits);
}

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("en-US")}`;
}

/** 通常料金・会員料金が同額の時間帯をまとめた1行。 */
export interface RateRow {
  normalYen: number;
  memberYen: number;
  savingPerHourYen: number;
  /** 損益分岐(月会費 ÷ 1時間あたりの差額)。補足表示用の正確な値。 */
  exactBreakEvenHours: number;
  /** 損益分岐を整数時間に切り上げた値。「月○時間以上で元が取れる」に使う。 */
  breakEvenHours: number;
  weekdaySlots: string[];
  weekendSlots: string[];
}

type DaySlots = "weekdaySlots" | "weekendSlots";

/**
 * COURT_PRICES から、通常/会員が同額の時間帯をまとめた行を作る(出現順を保つ)。
 * 例: 平日 17-23 時と土日祝の全時間帯は同額なので1行になる。
 */
export function buildRateRows(
  prices: readonly CourtPriceRow[],
  monthlyFeeYen: number,
): RateRow[] {
  const groups = new Map<string, RateRow>();

  const place = (
    normal: string,
    member: string,
    timeSlot: string,
    day: DaySlots,
  ): void => {
    const normalYen = parseYen(normal);
    const memberYen = parseYen(member);
    const savingPerHourYen = normalYen - memberYen;
    if (savingPerHourYen <= 0) {
      throw new Error(`会員料金が通常料金以上です: ${normal} / ${member}`);
    }
    const key = `${normalYen}/${memberYen}`;
    const row: RateRow = groups.get(key) ?? {
      normalYen,
      memberYen,
      savingPerHourYen,
      exactBreakEvenHours: monthlyFeeYen / savingPerHourYen,
      breakEvenHours: Math.ceil(monthlyFeeYen / savingPerHourYen),
      weekdaySlots: [],
      weekendSlots: [],
    };
    row[day].push(timeSlot);
    groups.set(key, row);
  };

  for (const p of prices) place(p.weekday, p.weekdayMember, p.timeSlot, "weekdaySlots");
  for (const p of prices) place(p.weekend, p.weekendMember, p.timeSlot, "weekendSlots");

  return [...groups.values()];
}

export interface MonthlyComparison {
  hours: number;
  normalTotalYen: number;
  memberTotalYen: number;
  /** 通常 − 会員。正なら会員のほうが安い。 */
  differenceYen: number;
  cheaper: "normal" | "member" | "same";
}

/** 月の利用時間ごとの支払額(会費込み)を比べる。レンタル用品・ポイント還元は含めない。 */
export function buildMonthlyComparison(
  hours: number,
  normalYen: number,
  memberYen: number,
  monthlyFeeYen: number,
): MonthlyComparison {
  const normalTotalYen = normalYen * hours;
  const memberTotalYen = monthlyFeeYen + memberYen * hours;
  const differenceYen = normalTotalYen - memberTotalYen;
  const cheaper =
    differenceYen > 0 ? "member" : differenceYen < 0 ? "normal" : "same";
  return { hours, normalTotalYen, memberTotalYen, differenceYen, cheaper };
}

export interface RateSummary {
  memberMinYen: number;
  memberMaxYen: number;
  savingMinYen: number;
  savingMaxYen: number;
}

export function summarizeRates(rows: readonly RateRow[]): RateSummary {
  const members = rows.map((r) => r.memberYen);
  const savings = rows.map((r) => r.savingPerHourYen);
  return {
    memberMinYen: Math.min(...members),
    memberMaxYen: Math.max(...members),
    savingMinYen: Math.min(...savings),
    savingMaxYen: Math.max(...savings),
  };
}
