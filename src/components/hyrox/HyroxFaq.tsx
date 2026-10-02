"use client";

import { useLocale, useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import StructuredData from "@/components/StructuredData";
import { EASE, revealInitial } from "@/constants/motion";
import { buildHyroxDescriptionValues } from "@/lib/metadata/hyroxDescriptionValues";
import { courtPriceRange } from "@/lib/pricing/courtPriceRange";
import { buildFaqPage, type FaqItem } from "@/lib/structured-data";
import HyroxSectionTitle from "./HyroxSectionTitle";

const FAQ_KEYS = [
  "certified",
  "whatIs",
  "beginner",
  "price",
  "bring",
  "reserve",
  "access",
] as const;

export default function HyroxFaq() {
  const t = useTranslations("HyroxPage.faq");
  const locale = useLocale();
  const prefersReducedMotion = useReducedMotion();
  const { min, max } = courtPriceRange();
  const values = {
    ...buildHyroxDescriptionValues(locale),
    rentalMin: min,
    rentalMax: max,
  };
  // 表示と FAQPage の文面を一致させるため、差し込み済みの文字列から両方を作る。
  const items: FaqItem[] = FAQ_KEYS.map((key) => ({
    question: t(`items.${key}.question`, values),
    answer: t(`items.${key}.answer`, values),
  }));

  return (
    <section className="bg-deep-black py-12 text-text-light lg:py-16">
      <motion.div
        className="mx-auto max-w-3xl px-6 lg:px-12"
        initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 1.0, ease: EASE }}
      >
        <div className="text-center">
          <HyroxSectionTitle title={t("title")} titleJa={t("titleJa")} />
        </div>

        <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
          {items.map((item) => (
            <details key={item.question} className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 text-sm font-bold text-text-light marker:content-['']">
                {item.question}
                <span
                  aria-hidden
                  className="shrink-0 text-accent motion-safe:transition-transform group-open:rotate-45"
                >
                  ＋
                </span>
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-text-light/70">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </motion.div>

      <StructuredData data={buildFaqPage(items)} />
    </section>
  );
}
