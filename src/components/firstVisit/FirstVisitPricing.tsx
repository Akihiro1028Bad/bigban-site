"use client";

import { useTranslations } from "next-intl";

import CourtPriceTable from "@/components/pricing/CourtPriceTable";
import { perPersonRows } from "@/constants/firstVisit";

import FirstVisitSection from "./FirstVisitSection";

export default function FirstVisitPricing() {
  const t = useTranslations("FirstVisit.pricing");
  const rows = perPersonRows();

  return (
    <FirstVisitSection
      id="first-visit-pricing"
      kicker={t("headingEn")}
      heading={t("heading")}
    >
      <p className="mb-8 max-w-2xl text-sm leading-relaxed text-text-light/70">
        {t("intro")}
      </p>
      <CourtPriceTable pbtClubLocation="first_visit_pricing_pbt_club" />
      <div className="overflow-x-auto">
        <table className="w-full">
          <caption className="mb-3 text-left text-[10px] tracking-[0.25em] text-accent">
            {t("perPersonLabel")}
          </caption>
          <thead>
            <tr className="border-b-2 border-accent/20">
              <th className="bg-accent/[0.06] px-2 py-3 text-center text-xs font-semibold tracking-[0.15em] text-text-light sm:px-4">
                {t("timeSlot")}
              </th>
              <th className="bg-accent/[0.06] px-2 py-3 text-center text-xs font-semibold tracking-[0.15em] text-text-light sm:px-4">
                {t("weekday")}
              </th>
              <th className="bg-accent/[0.06] px-2 py-3 text-center text-xs font-semibold tracking-[0.15em] text-text-light sm:px-4">
                {t("weekend")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.timeSlot} className="border-b border-white/[0.04]">
                <td className="whitespace-nowrap px-2 py-4 text-center text-sm font-medium text-text-light sm:px-4">
                  {row.timeSlot}
                </td>
                <td className="px-2 py-4 text-center text-lg font-bold text-text-light sm:px-4">
                  {row.weekday}
                </td>
                <td className="px-2 py-4 text-center text-lg font-bold text-text-light sm:px-4">
                  {row.weekend}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-text-gray">{t("note")}</p>
    </FirstVisitSection>
  );
}
