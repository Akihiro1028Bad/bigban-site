import Link from "next/link";

import { getEndedLabels } from "@/lib/news/endedLabels";

type Locale = "ja" | "en";

interface NewsEndedNoticeProps {
  locale: Locale;
}

const LINK_CLASS =
  "text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

/** 終了したニュース詳細の本文冒頭に出す帯。最新の開催情報への行き先を示す。 */
export function NewsEndedNotice({ locale }: NewsEndedNoticeProps) {
  const labels = getEndedLabels(locale);
  return (
    <div
      role="note"
      className="mb-8 border border-text-gray/40 bg-text-gray/10 px-5 py-4 text-sm lg:text-base text-text-light"
    >
      {labels.message}
      <Link href={labels.newsHref} className={LINK_CLASS}>
        {labels.newsLabel}
      </Link>
      {labels.separator}
      <Link href={labels.reserveHref} className={LINK_CLASS}>
        {labels.reserveLabel}
      </Link>
      {labels.suffix}
    </div>
  );
}
