"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import CourtPriceTable from "@/components/pricing/CourtPriceTable";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

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

        <CourtPriceTable />
      </div>
    </section>
  );
}
