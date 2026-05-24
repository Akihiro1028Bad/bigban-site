"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const NUMBER_KEYS = ["run", "workouts", "race"] as const;

export default function HyroxIntro() {
  const t = useTranslations("HyroxPage.whatIs");

  const keyNumbers = NUMBER_KEYS.map((key) => ({
    key,
    value: t(`keyNumbers.${key}.value`),
    labelEn: t(`keyNumbers.${key}.labelEn`),
    labelJa: t(`keyNumbers.${key}.labelJa`),
  }));

  return (
    <section className="bg-deep-black py-24 lg:py-32">
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

        <div className="grid grid-cols-1 sm:grid-cols-3 mt-16 border-t border-b border-text-gray/10">
          {keyNumbers.map((item, i) => (
            <motion.div
              key={item.key}
              className={`flex flex-col items-center text-center py-8${
                i < keyNumbers.length - 1 ? " sm:border-r sm:border-accent/20" : ""
              }${i > 0 ? " border-t sm:border-t-0 border-text-gray/10" : ""}`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-150px" }}
              transition={{ duration: 1.1, delay: i * 0.15, ease: EASE }}
            >
              <span
                className="font-serif text-text-light font-bold leading-none"
                style={{ fontSize: "clamp(3.5rem, 7vw, 7rem)" }}
              >
                {item.value}
              </span>
              <span className="text-xs tracking-[0.25em] text-accent mt-4">
                {item.labelEn}
              </span>
              <span className="text-sm text-text-gray mt-1">{item.labelJa}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
