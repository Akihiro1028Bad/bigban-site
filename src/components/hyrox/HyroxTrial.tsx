"use client";

import { useLocale, useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { EASE, revealInitial } from "@/constants/motion";
import { EXTERNAL_LINK_PROPS, LABOLA_SCHOOL_URL } from "@/constants/site";
import { trackCtaClick, trackLabolaEntry } from "@/lib/analytics/trackEvent";
import { buildHyroxDescriptionValues } from "@/lib/metadata/hyroxDescriptionValues";
import HyroxSectionTitle from "./HyroxSectionTitle";

// 公式トレーニングクラブ認定のお知らせ (microCMS slug)。日本語のみの記事。
const OFFICIAL_NEWS_SLUG = "hyrox-official-training-gym";
// 体験会の開催日のお知らせ (microCMS slug)。毎月この記事を更新して使い回す。日本語のみ。
// 固定ページには日付を書かない運用なので、開催日はこの記事と LaBOLA にだけ置く。
const SCHEDULE_NEWS_SLUG = "hyrox-morning-trial-class-2026";

export default function HyroxTrial() {
  const t = useTranslations("HyroxPage.trial");
  const locale = useLocale();
  const prefersReducedMotion = useReducedMotion();
  const { trialMinutes, trialPrice } = buildHyroxDescriptionValues(locale);
  const reserveLabel = t("reserveCta");

  const handleReserveClick = () => {
    trackCtaClick("reservation", "hyrox_trial", reserveLabel);
    trackLabolaEntry("program");
  };

  return (
    <section className="bg-deep-black py-12 lg:py-16">
      <motion.div
        className="mx-auto max-w-4xl px-6 lg:px-12"
        initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 1.0, ease: EASE }}
      >
        <div className="text-center">
          <HyroxSectionTitle title={t("title")} titleJa={t("titleJa")} />
          <p className="mx-auto mt-8 max-w-2xl text-sm leading-loose text-text-gray lg:text-base">
            {t("certified")}
          </p>
        </div>

        <div className="mt-10 rounded-sm border border-accent/40 border-t-2 border-t-accent bg-white/[0.02] p-6 text-center sm:p-8">
          <h3 className="font-sans text-xl font-black tracking-wide text-text-light sm:text-2xl">
            {t("cardTitle")}
          </h3>
          <p className="mt-2 text-lg font-bold text-accent">
            {t("cardMeta", { minutes: trialMinutes, price: trialPrice })}
          </p>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-text-light/75">
            {t("cardDescription")}
          </p>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-text-gray">
            {t("cardNote")}
          </p>

          <p className="mt-6 text-sm text-text-gray">
            {t("schedule")}
            {locale === "ja" ? (
              <>
                {" "}
                <TrackedLink
                  href={`/news/${SCHEDULE_NEWS_SLUG}`}
                  eventKey="contentClick"
                  location="hyrox_trial_schedule"
                  label={SCHEDULE_NEWS_SLUG}
                  className="text-accent underline underline-offset-4 transition-colors hover:text-accent/80"
                >
                  {t("scheduleCta")}
                </TrackedLink>
              </>
            ) : null}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
            <a
              href={LABOLA_SCHOOL_URL}
              {...EXTERNAL_LINK_PROPS}
              onClick={handleReserveClick}
              className="inline-flex w-full items-center justify-center gap-2 bg-accent px-6 py-3.5 text-sm font-bold tracking-[0.15em] text-deep-black transition-all hover:gap-3 hover:bg-accent/90 sm:w-auto sm:py-4"
            >
              {reserveLabel}
              <span aria-hidden="true">→</span>
              <span className="sr-only">{t("newTab")}</span>
            </a>
            {locale === "ja" ? (
              <TrackedLink
                href={`/news/${OFFICIAL_NEWS_SLUG}`}
                eventKey="contentClick"
                location="hyrox_trial_news"
                label={OFFICIAL_NEWS_SLUG}
                className="text-sm text-accent underline underline-offset-4 transition-colors hover:text-accent/80"
              >
                {t("newsCta")}
              </TrackedLink>
            ) : null}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
