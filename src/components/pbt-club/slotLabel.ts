import type { RateRow } from "@/lib/pbtClub/breakeven";

export type SlotTranslator = (
  key: "weekday" | "weekend" | "weekendAllDay",
  values?: { slot: string },
) => string;

/**
 * 行の時間帯ラベル。土日祝が全時間帯(totalSlots 件)そろっていれば「土日祝 終日」にまとめる。
 * 例: 「平日 17:00-23:00 / 土日祝 終日」
 */
export function slotLabel(
  row: RateRow,
  totalSlots: number,
  t: SlotTranslator,
): string {
  const weekday = row.weekdaySlots.map((slot) => t("weekday", { slot }));
  const weekend =
    row.weekendSlots.length === totalSlots
      ? [t("weekendAllDay")]
      : row.weekendSlots.map((slot) => t("weekend", { slot }));
  return [...weekday, ...weekend].join(" / ");
}
