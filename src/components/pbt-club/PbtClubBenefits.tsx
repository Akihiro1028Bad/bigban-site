import { useTranslations } from "next-intl";

import {
  PBT_CLUB_ADVANCE_BOOKING_DAYS,
  PBT_CLUB_POINT_RATE_PERCENT,
} from "@/constants/pbtClub";
import { formatYen } from "@/lib/pbtClub/breakeven";
import { PBT_CLUB_RATE_SUMMARY } from "@/lib/pbtClub/rates";

import PbtClubReveal from "./PbtClubReveal";
import PbtClubSectionHeading from "./PbtClubSectionHeading";

export default function PbtClubBenefits() {
  const t = useTranslations("PbtClub.benefits");
  const { savingMinYen, savingMaxYen } = PBT_CLUB_RATE_SUMMARY;
  const { general, member } = PBT_CLUB_ADVANCE_BOOKING_DAYS;

  const items = [
    {
      key: "discount",
      title: t("discount.title"),
      body: t("discount.body", {
        savingMin: formatYen(savingMinYen),
        savingMax: formatYen(savingMaxYen),
      }),
    },
    {
      key: "advance",
      title: t("advance.title", { member }),
      body: t("advance.body", { general, member }),
    },
    {
      key: "points",
      title: t("points.title"),
      body: t("points.body", { rate: PBT_CLUB_POINT_RATE_PERCENT }),
    },
  ];

  return (
    <section className="bg-deep-black pb-16 lg:pb-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <PbtClubReveal>
          <PbtClubSectionHeading label={t("heading")} title={t("headingJa")} />
          <ul className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {items.map((item, index) => (
              <li
                key={item.key}
                className="border border-white/10 bg-white/[0.02] px-6 py-6"
              >
                <p className="text-xs tracking-[0.2em] text-accent">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-lg font-bold text-text-light">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-text-light/70">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </PbtClubReveal>
      </div>
    </section>
  );
}
