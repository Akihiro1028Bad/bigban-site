"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { HYROX_STATIONS } from "./stations";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HyroxStations() {
  const t = useTranslations("HyroxPage.stations");

  return (
    <section className="bg-deep-black pb-24 lg:pb-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="mb-12"
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
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {HYROX_STATIONS.map((station, i) => (
            <motion.div
              key={station.key}
              className="relative bg-gradient-to-b from-accent/[0.07] to-transparent px-6 py-8"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1.0, delay: 0.1 + i * 0.06, ease: EASE }}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />
              <span className="font-serif text-3xl text-accent block mb-3">
                {station.number}
              </span>
              <span className="text-text-light text-base font-bold tracking-wide block">
                {t(`${station.key}.name`)}
              </span>
              <span className="text-text-gray text-xs block mt-1">
                {t(`${station.key}.nameJa`)}
              </span>
              <span className="text-accent/50 text-[10px] tracking-wider block mt-3">
                {t("preparing")}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
