import { useTranslations } from "next-intl";

import { PBT_CLUB_MONTHLY_HOUR_CAP } from "@/constants/pbtClub";
import { PBT_CLUB_PEAK_ROW } from "@/lib/pbtClub/rates";

import PbtClubReveal from "./PbtClubReveal";
import PbtClubSectionHeading from "./PbtClubSectionHeading";

const LIST_ITEM =
  "relative pl-5 text-sm leading-relaxed text-text-light/80 before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:bg-accent";

export default function PbtClubFit() {
  const t = useTranslations("PbtClub.fit");
  // 文言は ja/en 同一構造であることを pbtClubMessages.test.ts で保証している。
  const goodItems = t.raw("good.items") as string[];

  return (
    <section className="bg-deep-black pb-16 lg:pb-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <PbtClubReveal>
          <PbtClubSectionHeading label={t("heading")} title={t("headingJa")} />
          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h3 className="text-sm font-bold text-text-light">
                {t("good.heading")}
              </h3>
              <ul className="mt-4 space-y-3">
                {goodItems.map((item) => (
                  <li key={item} className={LIST_ITEM}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-light">
                {t("notGood.heading")}
              </h3>
              <ul className="mt-4 space-y-3">
                <li className={LIST_ITEM}>
                  {t("notGood.lowUse", {
                    hours: PBT_CLUB_PEAK_ROW.breakEvenHours - 1,
                  })}
                </li>
              </ul>
              <p className="mt-4 text-xs text-text-gray">
                {t("notGood.capNote", { cap: PBT_CLUB_MONTHLY_HOUR_CAP })}
              </p>
            </div>
          </div>
        </PbtClubReveal>
      </div>
    </section>
  );
}
