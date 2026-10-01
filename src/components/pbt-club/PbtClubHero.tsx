import { useTranslations } from "next-intl";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import {
  LABOLA_MEMBER_TYPES_URL,
  PBT_CLUB_MONTHLY_FEE_YEN,
  PBT_CLUB_MONTHLY_HOUR_CAP,
} from "@/constants/pbtClub";
import { formatYen } from "@/lib/pbtClub/breakeven";
import { PBT_CLUB_RATE_SUMMARY } from "@/lib/pbtClub/rates";

import PbtClubReveal from "./PbtClubReveal";

export default function PbtClubHero() {
  const t = useTranslations("PbtClub.hero");
  const { memberMinYen, memberMaxYen, savingMinYen, savingMaxYen } =
    PBT_CLUB_RATE_SUMMARY;

  return (
    <section className="pt-[calc(7rem+var(--promo-banner-h))] pb-12 lg:pt-[calc(8rem+var(--promo-banner-h))] lg:pb-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <PbtClubReveal className="text-center">
          <p className="text-xs tracking-[0.3em] text-accent">{t("label")}</p>
          <h1 className="mt-4 font-serif text-[clamp(2.5rem,16vw,3.5rem)] font-black leading-none tracking-[0.08em] text-text-light sm:text-7xl lg:text-8xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-sm tracking-[0.25em] text-text-gray sm:text-base">
            {t("subtitle")}
          </p>
          <div className="mx-auto mt-5 h-[3px] w-14 bg-accent" />
          <p className="mx-auto mt-8 max-w-2xl text-sm leading-relaxed text-text-light/80 sm:text-base">
            {t("lead", {
              savingMin: formatYen(savingMinYen),
              savingMax: formatYen(savingMaxYen),
              cap: PBT_CLUB_MONTHLY_HOUR_CAP,
            })}
          </p>

          <dl className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="border border-white/10 bg-white/[0.02] px-6 py-6">
              <dt className="text-xs tracking-[0.2em] text-text-gray">
                {t("feeLabel")}
              </dt>
              <dd className="mt-2 text-3xl font-bold text-text-light">
                {formatYen(PBT_CLUB_MONTHLY_FEE_YEN)}
              </dd>
              <dd className="mt-1 text-xs text-text-gray">{t("feeNote")}</dd>
            </div>
            <div className="border border-accent/30 bg-accent/[0.06] px-6 py-6">
              <dt className="text-xs tracking-[0.2em] text-text-gray">
                {t("rateLabel")}
              </dt>
              <dd className="mt-2 text-3xl font-bold text-accent">
                {`${formatYen(memberMinYen)}〜${formatYen(memberMaxYen)}`}
              </dd>
            </div>
          </dl>

          <div className="mt-10">
            <TrackedLink
              href={LABOLA_MEMBER_TYPES_URL}
              external
              target="_blank"
              rel="noopener noreferrer"
              eventKey="externalLink"
              location="pbt_club_join_hero"
              label={t("joinCta")}
              className="inline-block bg-accent px-8 py-3 text-sm font-bold tracking-widest text-deep-black transition-colors hover:bg-accent/90"
            >
              {t("joinCta")}
            </TrackedLink>
            <p className="mt-3 text-xs text-text-gray">{t("joinNote")}</p>
          </div>
        </PbtClubReveal>
      </div>
    </section>
  );
}
