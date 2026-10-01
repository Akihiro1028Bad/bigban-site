"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

import { EASE, revealInitial } from "@/constants/motion";

import FirstVisitSection from "./FirstVisitSection";

const STEP_KEYS = ["reserve", "pay", "enter", "play"] as const;

export default function FirstVisitFlow() {
  const t = useTranslations("FirstVisit.flow");
  const prefersReducedMotion = useReducedMotion();

  return (
    <FirstVisitSection
      id="first-visit-flow"
      kicker={t("headingEn")}
      heading={t("heading")}
    >
      <ol className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {STEP_KEYS.map((key, i) => (
          <motion.li
            key={key}
            className="border-t border-text-gray/20 pt-4"
            initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 16 })}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 1.0, delay: i * 0.1, ease: EASE }}
          >
            {/* 連番は装飾。順序は ol が伝える。 */}
            <p
              aria-hidden
              className="font-serif text-2xl font-black tracking-[0.15em] text-accent"
            >
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-3 font-sans text-base font-bold">
              {t(`steps.${key}.title`)}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-light/70">
              {t(`steps.${key}.description`)}
            </p>
          </motion.li>
        ))}
      </ol>
    </FirstVisitSection>
  );
}
