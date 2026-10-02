import { getEndedLabels } from "@/lib/news/endedLabels";

type Locale = "ja" | "en";

interface NewsEndedBadgeProps {
  locale: Locale;
  className?: string;
}

/** 終了したニュースに付ける「終了/Ended」バッジ。カテゴリ色と区別するため灰色の枠にする。 */
export function NewsEndedBadge({ locale, className }: NewsEndedBadgeProps) {
  const base =
    "inline-block whitespace-nowrap px-2 py-0.5 border border-text-gray text-text-gray";
  return (
    <span className={className ? `${base} ${className}` : base}>
      {getEndedLabels(locale).badge}
    </span>
  );
}
