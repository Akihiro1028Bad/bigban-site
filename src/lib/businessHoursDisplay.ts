import { BUSINESS_HOURS_DISPLAY } from "@/constants/site";

/** 本文・メタ description の `{open}` `{close}` に差し込む営業時間表記(単一ソースは site.ts)。 */
export function businessHoursDisplayFor(locale: string): {
  readonly open: string;
  readonly close: string;
} {
  return locale === "ja" ? BUSINESS_HOURS_DISPLAY.ja : BUSINESS_HOURS_DISPLAY.en;
}
