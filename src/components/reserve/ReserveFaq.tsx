"use client";

import { useTranslations } from "next-intl";
import StructuredData from "@/components/StructuredData";
import { buildFaqPage, type FaqItem } from "@/lib/structured-data";

export default function ReserveFaq() {
  const t = useTranslations("Reserve.faq");
  // t.raw は unknown を返すため、システム境界として配列であることを検証する。
  const rawItems = t.raw("items");
  const items: FaqItem[] = Array.isArray(rawItems)
    ? (rawItems as FaqItem[])
    : [];

  return (
    <section className="bg-deep-black pb-20 lg:pb-28">
      <div className="mx-auto max-w-3xl px-6 lg:px-12">
        <h2 className="text-xs tracking-[0.3em] text-accent">{t("heading")}</h2>

        <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
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
      </div>

      <StructuredData data={buildFaqPage(items)} />
    </section>
  );
}
