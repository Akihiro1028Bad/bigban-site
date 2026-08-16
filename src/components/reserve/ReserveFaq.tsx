"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import StructuredData from "@/components/StructuredData";
import { buildFaqPage, type FaqItem } from "@/lib/structured-data";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

/** t.raw は unknown を返すため、要素の形までシステム境界として検証する。 */
function isFaqItem(value: unknown): value is FaqItem {
  if (typeof value !== "object" || value === null) return false;
  const { question, answer } = value as Record<string, unknown>;
  return (
    typeof question === "string" &&
    question.trim() !== "" &&
    typeof answer === "string" &&
    answer.trim() !== ""
  );
}

export default function ReserveFaq() {
  const t = useTranslations("Reserve.faq");
  const rawItems = t.raw("items");
  const items: FaqItem[] = Array.isArray(rawItems)
    ? rawItems.filter(isFaqItem)
    : [];

  return (
    <section className="bg-deep-black pb-20 lg:pb-28">
      {/* 見出しの左端は ReserveInfo と同じ max-w-7xl 側で揃え、
          設問リストだけ読みやすい幅(max-w-3xl)に絞る。 */}
      <motion.div
        className="mx-auto max-w-7xl px-6 lg:px-12"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 1.0, ease: EASE }}
      >
        <h2 className="text-xs tracking-[0.3em] text-accent">{t("heading")}</h2>

        <div className="mt-8 max-w-3xl divide-y divide-white/10 border-y border-white/10">
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

      {items.length > 0 && <StructuredData data={buildFaqPage(items)} />}
    </section>
  );
}
