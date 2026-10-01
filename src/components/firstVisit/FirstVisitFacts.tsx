"use client";

import { useTranslations } from "next-intl";

import { BOOKING_WINDOW_DAYS } from "@/constants/firstVisit";

import FirstVisitSection from "./FirstVisitSection";

const FACT_KEYS = [
  "bring",
  "rental",
  "bookingOpens",
  "cancel",
  "solo",
  "hours",
  "facility",
  "car",
  "late",
] as const;

export default function FirstVisitFacts() {
  const t = useTranslations("FirstVisit.facts");

  return (
    <FirstVisitSection
      id="first-visit-facts"
      kicker={t("headingEn")}
      heading={t("heading")}
    >
      <dl className="divide-y divide-white/10 border-y border-white/10">
        {FACT_KEYS.map((key) => (
          <div
            key={key}
            className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6"
          >
            <dt className="text-sm font-bold text-text-light">
              {t(`items.${key}.label`)}
            </dt>
            <dd className="text-sm leading-relaxed text-text-light/70">
              {t(`items.${key}.value`, BOOKING_WINDOW_DAYS)}
            </dd>
          </div>
        ))}
      </dl>
    </FirstVisitSection>
  );
}
