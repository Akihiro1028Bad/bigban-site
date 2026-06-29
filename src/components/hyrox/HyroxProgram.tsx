"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { EASE } from "@/constants/motion";


export default function HyroxProgram() {
  const t = useTranslations("HyroxPage.program");

  return (
    <section className="bg-deep-black pb-12 lg:pb-16 text-text-light">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.15em]">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        <motion.div
          className="mx-auto max-w-md rounded-sm border border-accent/20 border-t-2 border-t-accent bg-white/[0.02] px-8 py-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, delay: 0.1, ease: EASE }}
        >
          <p className="text-[10px] tracking-[0.25em] text-accent">
            {t("rateLabel")}
          </p>
          <p className="mt-3 text-sm font-medium tracking-[0.1em] text-text-light">
            {t("duration")}
          </p>
          <div className="mt-5 grid grid-cols-2 divide-x divide-white/[0.08]">
            <div className="px-4">
              <p className="text-[11px] tracking-[0.15em] text-text-gray">
                {t("weekday")}
              </p>
              <p className="mt-2 font-serif text-3xl font-black tracking-tight text-text-light sm:text-4xl">
                {t("weekdayPrice")}
              </p>
            </div>
            <div className="px-4">
              <p className="text-[11px] tracking-[0.15em] text-text-gray">
                {t("weekend")}
              </p>
              <p className="mt-2 font-serif text-3xl font-black tracking-tight text-text-light sm:text-4xl">
                {t("weekendPrice")}
              </p>
            </div>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-text-gray">
            {t("note")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
