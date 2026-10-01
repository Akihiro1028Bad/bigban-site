"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

import { EASE, revealInitial } from "@/constants/motion";

export default function PrivateHero() {
  const t = useTranslations("Private.hero");
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="pt-[calc(7rem+var(--promo-banner-h))] pb-10 lg:pt-[calc(8rem+var(--promo-banner-h))] lg:pb-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="text-center"
          initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <h1 className="font-serif text-[clamp(1.5rem,8.2vw,3rem)] leading-none sm:text-6xl lg:text-7xl font-black tracking-[0.04em] sm:tracking-[0.1em] text-text-light">
            {t("title")}
          </h1>
          <p className="mt-4 text-sm sm:text-base tracking-[0.25em] text-text-gray">
            {t("subtitle")}
          </p>
          <div className="mx-auto mt-5 w-14 h-[3px] bg-accent" />
          <p className="mx-auto mt-8 max-w-2xl text-sm leading-relaxed text-text-gray sm:text-base">
            {t("lead")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
