"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import HyroxStations from "./HyroxStations";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HyroxIntro() {
  const t = useTranslations("HyroxPage.whatIs");

  return (
    <section className="bg-deep-black pt-12 pb-24 lg:pt-16 lg:pb-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.15em] text-text-light">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <div className="mt-4 w-14 h-[3px] bg-accent" />
          <p className="mt-8 text-text-gray text-sm lg:text-base leading-loose max-w-2xl">
            {t("lead")}
          </p>
        </motion.div>

        <HyroxStations />
      </div>
    </section>
  );
}
