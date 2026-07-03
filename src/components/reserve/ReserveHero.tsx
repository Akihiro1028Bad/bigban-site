"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function ReserveHero() {
  const t = useTranslations("Reserve.hero");

  return (
    <section className="pt-[calc(7rem+var(--promo-banner-h))] pb-10 lg:pt-[calc(8rem+var(--promo-banner-h))] lg:pb-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <h1 className="font-serif text-5xl sm:text-7xl lg:text-8xl font-black tracking-[0.08em] sm:tracking-[0.15em] text-text-light">
            {t("title")}
          </h1>
          <p className="mt-4 text-sm sm:text-base tracking-[0.25em] text-text-gray">
            {t("subtitle")}
          </p>
          <div className="mx-auto mt-5 w-14 h-[3px] bg-accent" />
        </motion.div>
      </div>
    </section>
  );
}
