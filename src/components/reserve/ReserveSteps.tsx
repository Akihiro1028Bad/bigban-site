"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const STEP_KEYS = ["step01", "step02", "step03"] as const;
const STEP_NUMBERS = ["01", "02", "03"] as const;

export default function ReserveSteps() {
  const t = useTranslations("Reserve.steps");

  return (
    <section className="bg-deep-black py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="text-center mb-8 lg:mb-12"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-black tracking-[0.12em] text-text-light">
            {t("headingEn")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("heading")}
          </p>
          <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        <motion.ol
          className="grid grid-cols-1 sm:grid-cols-3 gap-8 lg:gap-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={{ visible: { transition: { staggerChildren: 0.15 } } }}
        >
          {STEP_KEYS.map((key, i) => (
            <motion.li
              key={key}
              className="text-center sm:text-left"
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.8, ease: EASE },
                },
              }}
            >
              <span className="font-serif text-5xl lg:text-6xl text-accent block mb-3">
                {STEP_NUMBERS[i]}
              </span>
              <h3 className="font-serif text-lg lg:text-xl text-text-light mb-2">
                {t(`${key}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-text-light/70">
                {t(`${key}.description`)}
              </p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
