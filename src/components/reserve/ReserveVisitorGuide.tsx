"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { EASE, revealInitial } from "@/constants/motion";

const STEP_KEYS = ["step1", "step2", "step3"] as const;

export default function ReserveVisitorGuide() {
  const t = useTranslations("Reserve.guide");
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="bg-deep-black pb-12 lg:pb-16">
      <motion.div
        className="mx-auto max-w-3xl px-6 lg:px-12"
        initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 16 })}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        <p className="text-[11px] font-semibold tracking-[0.3em] text-accent">
          {t("kicker")}
        </p>
        <h2 className="mt-2 font-sans text-xl font-black tracking-wide text-text-light sm:text-2xl">
          {t("heading")}
        </h2>

        <ol className="mt-6 space-y-4">
          {STEP_KEYS.map((key, index) => (
            <li key={key} className="flex gap-4">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center bg-accent text-sm font-black text-deep-black"
              >
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-bold text-text-light">
                  {t(`${key}Title`)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-text-gray">
                  {t(`${key}Body`)}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 border border-accent/30 bg-white/[0.02] p-4 sm:p-5">
          <h3 className="text-sm font-bold text-text-light">
            {t("registerHeading")}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-text-gray">
            {t("registerBody")}
          </p>
        </div>
      </motion.div>
    </section>
  );
}
