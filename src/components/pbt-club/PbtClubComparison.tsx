import { useTranslations } from "next-intl";

import { PBT_CLUB_MONTHLY_FEE_YEN } from "@/constants/pbtClub";
import { buildMonthlyComparison, formatYen } from "@/lib/pbtClub/breakeven";
import {
  PBT_CLUB_COMPARISON_HOURS,
  PBT_CLUB_PEAK_ROW,
} from "@/lib/pbtClub/rates";

import PbtClubReveal from "./PbtClubReveal";
import PbtClubSectionHeading from "./PbtClubSectionHeading";

const HEADER_CELL =
  "bg-accent/[0.06] px-2 py-3 text-center text-[11px] font-semibold tracking-[0.05em] text-text-light sm:px-4 sm:text-xs sm:tracking-[0.15em]";

const COMPARISONS = PBT_CLUB_COMPARISON_HOURS.map((hours) =>
  buildMonthlyComparison(
    hours,
    PBT_CLUB_PEAK_ROW.normalYen,
    PBT_CLUB_PEAK_ROW.memberYen,
    PBT_CLUB_MONTHLY_FEE_YEN,
  ),
);

export default function PbtClubComparison() {
  const t = useTranslations("PbtClub.comparison");

  return (
    <section className="bg-deep-black pb-16 lg:pb-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <PbtClubReveal>
          <PbtClubSectionHeading label={t("heading")} title={t("headingJa")} />
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-text-light/80">
            {t("lead", {
              normal: formatYen(PBT_CLUB_PEAK_ROW.normalYen),
              member: formatYen(PBT_CLUB_PEAK_ROW.memberYen),
            })}
          </p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-accent/20">
                  <th scope="col" className={HEADER_CELL}>{t("columns.hours")}</th>
                  <th scope="col" className={HEADER_CELL}>{t("columns.normal")}</th>
                  <th scope="col" className={HEADER_CELL}>{t("columns.member")}</th>
                  <th scope="col" className={HEADER_CELL}>{t("columns.result")}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISONS.map((row) => (
                  <tr key={row.hours} className="border-b border-white/[0.04]">
                    <td className="px-2 py-4 sm:py-5 text-center text-xs font-medium text-text-light sm:text-sm sm:px-4">
                      {t("hoursValue", { hours: row.hours })}
                    </td>
                    <td className="px-2 py-4 sm:py-5 text-center text-base font-bold sm:text-lg text-text-light sm:px-4">
                      {formatYen(row.normalTotalYen)}
                    </td>
                    <td className="px-2 py-4 sm:py-5 text-center text-base font-bold sm:text-lg text-text-light sm:px-4">
                      {formatYen(row.memberTotalYen)}
                    </td>
                    <td
                      className={`px-2 py-4 sm:py-5 text-center text-xs font-bold sm:px-4 sm:text-sm ${
                        row.cheaper === "member" ? "text-accent" : "text-text-light/80"
                      }`}
                    >
                      {t(`result.${row.cheaper}`, {
                        amount: formatYen(Math.abs(row.differenceYen)),
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PbtClubReveal>
      </div>
    </section>
  );
}
