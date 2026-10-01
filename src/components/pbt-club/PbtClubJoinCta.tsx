import { useTranslations } from "next-intl";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { LABOLA_MEMBER_TYPES_URL } from "@/constants/pbtClub";
import { RESERVE_PATH } from "@/constants/site";

import PbtClubReveal from "./PbtClubReveal";
import PbtClubSectionHeading from "./PbtClubSectionHeading";

export default function PbtClubJoinCta() {
  const t = useTranslations("PbtClub.join");

  return (
    <section className="bg-deep-black pb-16 lg:pb-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <PbtClubReveal className="border border-accent/30 bg-accent/[0.04] px-6 py-10 text-center lg:px-12">
          <div className="inline-block text-left">
            <PbtClubSectionHeading label={t("heading")} title={t("headingJa")} />
          </div>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-text-light/80">
            {t("body")}
          </p>
          <div className="mt-8">
            <TrackedLink
              href={LABOLA_MEMBER_TYPES_URL}
              external
              target="_blank"
              rel="noopener noreferrer"
              eventKey="externalLink"
              location="pbt_club_join_bottom"
              label={t("cta")}
              className="inline-block bg-accent px-8 py-3 text-sm font-bold tracking-widest text-deep-black transition-colors hover:bg-accent/90"
            >
              {t("cta")}
            </TrackedLink>
          </div>
          <p className="mt-8 text-xs text-text-gray">{t("reserveBody")}</p>
          <div className="mt-3">
            <TrackedLink
              href={RESERVE_PATH}
              eventKey="reserveEntry"
              location="pbt_club_reserve"
              label={t("reserveCta")}
              className="inline-block border border-accent/60 px-6 py-2 text-sm font-bold tracking-widest text-accent transition-colors hover:bg-accent/10"
            >
              {t("reserveCta")}
            </TrackedLink>
          </div>
        </PbtClubReveal>
      </div>
    </section>
  );
}
