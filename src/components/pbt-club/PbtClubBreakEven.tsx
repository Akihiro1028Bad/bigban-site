import { useTranslations } from "next-intl";

import { PBT_CLUB_MONTHLY_FEE_YEN, PBT_CLUB_MONTHLY_HOUR_CAP } from "@/constants/pbtClub";
import { formatYen } from "@/lib/pbtClub/breakeven";
import { PBT_CLUB_RATE_ROWS } from "@/lib/pbtClub/rates";

import PbtClubReveal from "./PbtClubReveal";
import PbtClubSectionHeading from "./PbtClubSectionHeading";
import { slotLabel } from "./slotLabel";

export default function PbtClubBreakEven() {
  const t = useTranslations("PbtClub.breakEven");
  const tSlots = useTranslations("PbtClub.slots");

  return (
    <section className="bg-deep-black pb-16 lg:pb-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <PbtClubReveal>
          <PbtClubSectionHeading label={t("heading")} title={t("headingJa")} />
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-light/80">
            {t("lead", { fee: formatYen(PBT_CLUB_MONTHLY_FEE_YEN) })}
          </p>

          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PBT_CLUB_RATE_ROWS.map((row) => (
              <li
                key={`${row.normalYen}-${row.memberYen}`}
                className="border border-white/10 bg-white/[0.02] px-6 py-6"
              >
                <p className="text-sm font-medium text-text-light">
                  {slotLabel(row, tSlots)}
                </p>
                <p className="mt-4 text-3xl font-bold text-accent">
                  {t("threshold", { hours: row.breakEvenHours })}
                </p>
                <p className="mt-1 text-sm text-text-light/80">
                  {t("thresholdNote")}
                </p>
                <p className="mt-3 text-xs text-text-gray">
                  {t("exact", { hours: row.exactBreakEvenHours.toFixed(1) })}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs text-text-gray">{t("formula")}</p>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-text-gray">
            {t("note", { cap: PBT_CLUB_MONTHLY_HOUR_CAP })}
          </p>
        </PbtClubReveal>
      </div>
    </section>
  );
}
