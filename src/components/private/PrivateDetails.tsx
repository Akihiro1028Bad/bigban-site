"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";

import { EASE, revealInitial } from "@/constants/motion";
import { businessHoursDisplayFor } from "@/lib/businessHoursDisplay";

import type { ReactNode } from "react";

const SCOPE_KEYS = ["court", "facility", "showCourt", "amenities"] as const;
const GUIDE_KEYS = ["people", "hours", "price"] as const;
const FLOW_KEYS = ["inquiry", "contact", "confirm", "use"] as const;

interface RevealSectionProps {
  heading: string;
  children: ReactNode;
}

function RevealSection({ heading, children }: RevealSectionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      className="mx-auto max-w-7xl px-6 pb-14 lg:px-12 lg:pb-20"
      initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 1.0, ease: EASE }}
    >
      <h2 className="text-xs tracking-[0.3em] text-accent">{heading}</h2>
      <div className="mt-8">{children}</div>
    </motion.section>
  );
}

export default function PrivateDetails() {
  const t = useTranslations("Private");
  const hours = businessHoursDisplayFor(useLocale());

  return (
    <>
      <RevealSection heading={t("scope.heading")}>
        <ul className="grid gap-6 sm:grid-cols-2">
          {SCOPE_KEYS.map((key) => (
            <li key={key} className="border-t border-white/10 pt-5">
              <h3 className="text-base font-bold text-text-light">
                {t(`scope.items.${key}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-gray">
                {t(`scope.items.${key}.description`)}
              </p>
            </li>
          ))}
        </ul>
      </RevealSection>

      <RevealSection heading={t("guide.heading")}>
        <dl className="divide-y divide-white/10 border-y border-white/10">
          {GUIDE_KEYS.map((key) => (
            <div key={key} className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr]">
              <dt className="text-sm font-bold text-text-light">
                {t(`guide.items.${key}.title`)}
              </dt>
              <dd className="text-sm leading-relaxed text-text-gray">
                {t(`guide.items.${key}.description`, hours)}
              </dd>
            </div>
          ))}
        </dl>
      </RevealSection>

      <RevealSection heading={t("flow.heading")}>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW_KEYS.map((key, index) => (
            <li key={key} className="border-t border-white/10 pt-5">
              <span className="font-serif text-sm tracking-wider text-accent/60">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-base font-bold text-text-light">
                {t(`flow.steps.${key}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-gray">
                {t(`flow.steps.${key}.description`)}
              </p>
            </li>
          ))}
        </ol>
      </RevealSection>
    </>
  );
}
