import { mergeContiguousSlots } from "@/lib/pbtClub/slots";

import type { RateRow } from "@/lib/pbtClub/breakeven";

export type SlotTranslator = (
  key: "weekday" | "weekend",
  values: { slot: string },
) => string;

/**
 * 行の時間帯ラベル。連続する時間帯は1つの範囲にまとめる。
 * 例: 「平日 17:00-23:00 / 土日祝 6:00-23:00」
 */
export function slotLabel(row: RateRow, t: SlotTranslator): string {
  const weekday = mergeContiguousSlots(row.weekdaySlots).map((slot) =>
    t("weekday", { slot }),
  );
  const weekend = mergeContiguousSlots(row.weekendSlots).map((slot) =>
    t("weekend", { slot }),
  );
  return [...weekday, ...weekend].join(" / ");
}
