import { useTranslations } from "next-intl";

import { formatYen } from "@/lib/pbtClub/breakeven";
import { PBT_CLUB_RATE_ROWS } from "@/lib/pbtClub/rates";

import PbtClubReveal from "./PbtClubReveal";
import PbtClubSectionHeading from "./PbtClubSectionHeading";
import { slotLabel } from "./slotLabel";

const HEADER_CELL =
  "bg-accent/[0.06] px-2 py-3 text-center text-[11px] font-semibold tracking-[0.05em] text-text-light sm:px-4 sm:text-xs sm:tracking-[0.15em]";

export default function PbtClubRates() {
  const t = useTranslations("PbtClub.rates");
  const tSlots = useTranslations("PbtClub.slots");

  return (
    <section className="bg-deep-black pb-16 lg:pb-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <PbtClubReveal>
          <PbtClubSectionHeading label={t("heading")} title={t("headingJa")} />
          <div className="mt-8 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-accent/20">
                  <th scope="col" className={HEADER_CELL}>{t("columns.slot")}</th>
                  <th scope="col" className={HEADER_CELL}>{t("columns.normal")}</th>
                  <th scope="col" className={HEADER_CELL}>{t("columns.member")}</th>
                  <th scope="col" className={HEADER_CELL}>{t("columns.saving")}</th>
                </tr>
              </thead>
              <tbody>
                {PBT_CLUB_RATE_ROWS.map((row, i) => (
                  <tr
                    key={`${row.normalYen}-${row.memberYen}`}
                    className={`border-b border-white/[0.04] ${i % 2 === 1 ? "bg-white/[0.02]" : ""}`}
                  >
                    <td className="px-2 py-4 sm:py-5 text-center text-xs font-medium text-text-light sm:text-sm sm:px-4">
                      {slotLabel(row, tSlots)}
                    </td>
                    <td className="px-2 py-4 sm:py-5 text-center text-base font-bold sm:text-lg text-text-light sm:px-4">
                      {formatYen(row.normalYen)}
                    </td>
                    <td className="px-2 py-4 sm:py-5 text-center text-base font-bold sm:text-lg text-accent sm:px-4">
                      {formatYen(row.memberYen)}
                    </td>
                    <td className="px-2 py-4 sm:py-5 text-center text-xs text-text-light/80 sm:px-4 sm:text-sm">
                      {formatYen(row.savingPerHourYen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-text-gray">{t("note")}</p>
        </PbtClubReveal>
      </div>
    </section>
  );
}
