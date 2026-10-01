"use client";

import { useTranslations } from "next-intl";

import StructuredData from "@/components/StructuredData";
import { BOOKING_WINDOW_DAYS } from "@/constants/firstVisit";
import { buildFaqPage, type FaqItem } from "@/lib/structured-data";

import FirstVisitSection from "./FirstVisitSection";

const FAQ_KEYS = [
  "allBeginners",
  "solo",
  "bring",
  "bookingOpens",
  "cancel",
  "payment",
  "car",
] as const;

export default function FirstVisitFaq() {
  const t = useTranslations("FirstVisit.faq");
  // 表示と構造化データは同じ配列から作り、内容を一致させる。
  const items: FaqItem[] = FAQ_KEYS.map((key) => ({
    question: t(`items.${key}.question`),
    answer: t(`items.${key}.answer`, BOOKING_WINDOW_DAYS),
  }));

  return (
    <FirstVisitSection
      id="first-visit-faq"
      kicker={t("headingEn")}
      heading={t("heading")}
    >
      <StructuredData data={buildFaqPage(items)} />
      <div className="max-w-3xl divide-y divide-white/10 border-y border-white/10">
        {items.map((item) => (
          <details key={item.question} className="group">
            <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 text-sm font-bold text-text-light marker:content-['']">
              {item.question}
              <span
                aria-hidden
                className="shrink-0 text-accent motion-safe:transition-transform group-open:rotate-45"
              >
                ＋
              </span>
            </summary>
            <p className="pb-5 text-sm leading-relaxed text-text-light/70">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </FirstVisitSection>
  );
}
