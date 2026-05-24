"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HyroxProgram() {
  const t = useTranslations("HyroxPage.program");

  return (
    <section className="bg-deep-black pb-24 lg:pb-32 text-text-light">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="mb-10"
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
          <div className="mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        <motion.div
          className="border border-text-gray/15 rounded-sm px-8 py-16 flex flex-col items-center text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.0, delay: 0.1, ease: EASE }}
        >
          <span className="text-accent text-sm tracking-[0.3em] uppercase">
            {t("comingSoon")}
          </span>
          <p className="mt-4 text-text-gray text-sm max-w-md leading-relaxed">
            {t("note")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
