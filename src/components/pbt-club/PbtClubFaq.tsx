import { useTranslations } from "next-intl";

import StructuredData from "@/components/StructuredData";
import { buildFaqPage, type FaqItem } from "@/lib/structured-data";

import PbtClubReveal from "./PbtClubReveal";

export default function PbtClubFaq() {
  const t = useTranslations("PbtClub.faq");
  // 文言は ja/en 同一構造・全て非空であることを pbtClubMessages.test.ts で保証している。
  const items = t.raw("items") as FaqItem[];

  return (
    <section className="bg-deep-black pb-20 lg:pb-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <PbtClubReveal>
          <h2 className="text-xs tracking-[0.3em] text-accent">{t("heading")}</h2>

          {/* 設問が無いときは枠線ごと出さない(見出しの下に空の罫線が残るため)。 */}
          {items.length > 0 && (
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
          )}
        </PbtClubReveal>
      </div>

      {items.length > 0 && <StructuredData data={buildFaqPage(items)} />}
    </section>
  );
}
