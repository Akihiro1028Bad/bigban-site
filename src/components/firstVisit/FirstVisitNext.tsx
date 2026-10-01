"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { HYROX_PATH, PBT_CLUB_LINK_PATH } from "@/constants/firstVisit";
import { RESERVE_PATH } from "@/constants/site";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

import FirstVisitSection from "./FirstVisitSection";

const ENTRIES = [
  { key: "reserve", href: RESERVE_PATH, isReserve: true },
  { key: "hyrox", href: HYROX_PATH, isReserve: false },
  { key: "pbtClub", href: PBT_CLUB_LINK_PATH, isReserve: false },
] as const;

export default function FirstVisitNext() {
  const t = useTranslations("FirstVisit.next");

  return (
    <FirstVisitSection
      id="first-visit-next"
      kicker={t("headingEn")}
      heading={t("heading")}
    >
      <ul className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
        {ENTRIES.map(({ key, href, isReserve }) => (
          <li key={key} className="border-t border-text-gray/20 pt-4">
            <h3 className="font-sans text-base font-bold">
              {t(`items.${key}.title`)}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-light/70">
              {t(`items.${key}.description`)}
            </p>
            <Link
              href={href}
              onClick={
                isReserve
                  ? () =>
                      trackCtaClick(
                        "reserveEntry",
                        "first_visit_next",
                        t(`items.${key}.cta`),
                      )
                  : undefined
              }
              className="mt-4 inline-block text-sm text-accent underline-offset-4 hover:underline"
            >
              {t(`items.${key}.cta`)}
            </Link>
          </li>
        ))}
      </ul>
    </FirstVisitSection>
  );
}
