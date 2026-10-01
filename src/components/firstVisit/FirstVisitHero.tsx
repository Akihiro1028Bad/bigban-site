"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

import { Link as IntlLink } from "@/i18n/navigation";
import { BEGINNER_GUIDE_PATH } from "@/constants/firstVisit";
import { EASE, revealInitial } from "@/constants/motion";
import { RESERVE_PATH } from "@/constants/site";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

export default function FirstVisitHero() {
  const t = useTranslations("FirstVisit.hero");
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="bg-deep-black pb-12 pt-[calc(7rem+var(--promo-banner-h))] text-text-light lg:pb-16 lg:pt-[calc(8rem+var(--promo-banner-h))]">
      <motion.div
        className="mx-auto max-w-5xl px-6 lg:px-12"
        initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
      >
        <p className="text-[10px] tracking-[0.3em] text-accent">{t("kicker")}</p>
        {/* 和文見出しは Orbitron に和文グリフが無いため font-sans */}
        <h1 className="mt-3 font-sans text-4xl font-black tracking-[0.08em] sm:text-5xl">
          {t("title")}
        </h1>
        <div className="mt-5 h-[3px] w-14 bg-accent" />
        <p className="mt-8 max-w-2xl text-base leading-relaxed text-text-light/80 sm:text-lg">
          {t("lead")}
        </p>
        <p className="mt-4 text-sm text-text-gray">
          {t("rulesNote")}{" "}
          {/* コラムは日本語のみ。/en/columns/... は 404 になるため、ロケール接頭辞を付けない next/link を使う。 */}
          <Link
            href={BEGINNER_GUIDE_PATH}
            className="text-accent underline-offset-4 hover:underline"
          >
            {t("rulesLink")}
          </Link>
        </p>
        <IntlLink
          href={RESERVE_PATH}
          onClick={() =>
            trackCtaClick("reserveEntry", "first_visit_hero", t("cta"))
          }
          className="mt-8 inline-flex items-center bg-accent px-6 py-3 text-sm font-bold tracking-widest text-deep-black"
        >
          {t("cta")}
        </IntlLink>
      </motion.div>
    </section>
  );
}
