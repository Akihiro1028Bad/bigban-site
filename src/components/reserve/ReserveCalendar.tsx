"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  LABOLA_CALENDAR_TABS,
  buildLabolaCalendarSrc,
  type LabolaCalendarTabKey,
} from "@/constants/site";

import type { KeyboardEvent } from "react";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const PANEL_ID = "reserve-calendar-panel";

interface ReserveCalendarProps {
  initialTab?: LabolaCalendarTabKey;
}

export default function ReserveCalendar({ initialTab }: ReserveCalendarProps) {
  const t = useTranslations("Reserve.calendar");
  const [activeKey, setActiveKey] = useState<LabolaCalendarTabKey>(
    initialTab ?? LABOLA_CALENDAR_TABS[0].key,
  );
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIndex = LABOLA_CALENDAR_TABS.findIndex(
    (tab) => tab.key === activeKey,
  );
  const activeTab = LABOLA_CALENDAR_TABS[activeIndex];
  const activeLabel = t(`tabs.${activeKey}`);

  const focusTab = (index: number) => {
    setActiveKey(LABOLA_CALENDAR_TABS[index].key);
    /* istanbul ignore next -- @preserve ref は描画後に必ず設定される (null分岐は到達不可) */
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = LABOLA_CALENDAR_TABS.length;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % count;
    else if (event.key === "ArrowLeft") next = (index - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;
    event.preventDefault();
    focusTab(next);
  };

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
          className="mx-auto w-full max-w-[1100px]"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1.0, delay: 0.1, ease: EASE }}
        >
          {/* タブ（予約カテゴリ切替） */}
          <div
            role="tablist"
            aria-label={t("tablistLabel")}
            className="flex gap-2"
          >
            {LABOLA_CALENDAR_TABS.map((tab, i) => {
              const selected = tab.key === activeKey;
              return (
                <button
                  key={tab.key}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`reserve-tab-${tab.key}`}
                  aria-selected={selected}
                  aria-controls={PANEL_ID}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveKey(tab.key)}
                  onKeyDown={(event) => handleKeyDown(event, i)}
                  className={`flex-1 px-4 py-3 text-xs sm:text-sm font-bold tracking-[0.15em] motion-safe:transition-colors ${
                    selected
                      ? "bg-accent text-deep-black"
                      : "bg-deep-black text-text-gray border border-accent/20 hover:text-text-light"
                  }`}
                >
                  {t(`tabs.${tab.key}`)}
                </button>
              );
            })}
          </div>

          {/* カレンダー本体。単一パネルをタブ切替で使い回す構成のため、
              全タブの aria-controls は同一 PANEL_ID を参照し、パネルの
              aria-labelledby はアクティブタブを指す（意図的）。 */}
          <div
            id={PANEL_ID}
            role="tabpanel"
            aria-labelledby={`reserve-tab-${activeKey}`}
            className="border border-accent/20 border-t-2 border-t-accent bg-white rounded-b-sm overflow-hidden"
          >
            <iframe
              key={activeKey}
              src={buildLabolaCalendarSrc(activeTab.tabName)}
              title={`${activeLabel} ${t("iframeTitle")}`}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
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
          </div>
        </motion.div>
      </div>
    </section>
  );
}
