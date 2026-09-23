import { HYROX_LESSON_PRICES } from "@/constants/pricing";
import { BUSINESS_HOURS } from "@/constants/site";

// next-intl の差し込み値(Record<string, …>)に渡すため interface ではなく type にする。
export type HyroxDescriptionValues = {
  trialMinutes: number;
  trialPrice: string;
  open: string;
  close: string;
};

/** 日本語は「3,000円」、それ以外は「¥3,000」。 */
function formatYen(amount: number, locale: string): string {
  return locale === "ja"
    ? `${amount.toLocaleString("ja-JP")}円`
    : `¥${amount.toLocaleString("en-US")}`;
}

/** "06:00" → "6:00"(本文での表記。構造化データは HH:MM のまま使う)。 */
function formatTime(hhmm: string): string {
  return hhmm.replace(/^0(?=\d:)/, "");
}

/**
 * /hyrox の meta description に差し込む値。金額・時刻は定数が単一ソースで、
 * 文言(messages)には ICU の差し込み口だけを置く。
 */
export function buildHyroxDescriptionValues(
  locale: string,
): HyroxDescriptionValues {
  const { trial } = HYROX_LESSON_PRICES;
  return {
    trialMinutes: trial.minutes,
    trialPrice: formatYen(trial.priceYen, locale),
    open: formatTime(BUSINESS_HOURS.opens),
    close: formatTime(BUSINESS_HOURS.closes),
  };
}
