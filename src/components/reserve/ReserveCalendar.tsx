"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { LABOLA_CALENDAR_SRC } from "@/constants/site";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function ReserveCalendar() {
  const t = useTranslations("Reserve.calendar");

  return (
    <section className="bg-deep-black py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="text-center mb-8 lg:mb-12"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.12em] text-text-light">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("subtitle")}
          </p>
          <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        <motion.div
          className="mx-auto w-full max-w-[1100px] border border-accent/20 border-t-2 border-t-accent bg-white rounded-sm overflow-hidden"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1.0, delay: 0.1, ease: EASE }}
        >
          <iframe
            src={LABOLA_CALENDAR_SRC}
            title={t("iframeTitle")}
            loading="lazy"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            className="w-full h-[600px] md:h-[500px] border-0"
          />

          {/* スクロール案内: カレンダー枠の下に独立したスリムバー。
              iframe コンテンツに一切被らないため最終行も常に見える。 */}
          <div className="flex items-center justify-center gap-2 border-t border-accent/20 bg-deep-black py-2.5">
            <svg
              aria-hidden="true"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent motion-safe:animate-bounce"
            >
              <line x1="12" y1="4" x2="12" y2="20" />
              <polyline points="7 8 12 3 17 8" />
              <polyline points="7 16 12 21 17 16" />
            </svg>
            <span className="text-[10px] font-medium tracking-[0.2em] text-accent/90">
              {t("scrollHint")}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
