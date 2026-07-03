"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { EASE } from "@/constants/motion";
import {
  RESERVE_URL,
  LABOLA_PICKLEBALL_URL,
  LABOLA_HYROX_URL,
  EXTERNAL_LINK_PROPS,
} from "@/constants/site";

interface ChoiceCard {
  labelKey: "julyLabel" | "augLabel";
  periodKey: "julyPeriod" | "augPeriod";
  descKey: "julyDesc" | "augDesc";
  ctaKey: "julyCta" | "augCta";
  href: string;
}

// 7月分(RESERVA)と8月分(labola)はどちらも同等の選択肢のため同一スタイルで表示する。
// 8月になったら JULY_CARD（7月までの予約=RESERVA）を PICKLEBALL_CARDS から削除する。
const JULY_CARD: ChoiceCard = {
  labelKey: "julyLabel",
  periodKey: "julyPeriod",
  descKey: "julyDesc",
  ctaKey: "julyCta",
  href: RESERVE_URL,
};

const AUGUST_CARD: ChoiceCard = {
  labelKey: "augLabel",
  periodKey: "augPeriod",
  descKey: "augDesc",
  ctaKey: "augCta",
  href: LABOLA_PICKLEBALL_URL,
};

const PICKLEBALL_CARDS: readonly ChoiceCard[] = [JULY_CARD, AUGUST_CARD];

export default function ReserveChoice() {
  const t = useTranslations("Reserve.choice");

  return (
    <section className="bg-deep-black pb-16 lg:pb-24">
      <div className="mx-auto max-w-5xl px-6 lg:px-12">
        {/* ===== ピックルボールコート ===== */}
        <motion.div
          className="mb-8 text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          <p className="text-[11px] font-semibold tracking-[0.3em] text-accent">
            {t("pickleballKicker")}
          </p>
          <h2 className="mt-2 font-sans text-2xl font-black tracking-wide text-text-light sm:text-3xl">
            {t("pickleballHeading")}
          </h2>
          <div className="mx-auto mt-4 h-[2px] w-12 bg-accent" />
          {/* 移行案内は7月/8月の予約先が分かれるピックルのみに紐づく */}
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-text-light/80">
            {t("notice")}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:gap-8">
          {PICKLEBALL_CARDS.map((card, i) => (
            <motion.div
              key={card.ctaKey}
              className="flex flex-col rounded-sm border border-accent/40 border-t-2 border-t-accent bg-white/[0.02] p-5 sm:p-8 lg:p-10"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-120px" }}
              transition={{ duration: 1.0, delay: i * 0.12, ease: EASE }}
            >
              <p className="text-[10px] tracking-[0.25em] text-accent">
                {t(card.periodKey)}
              </p>
              {/* font-serif(Orbitron) は数字 7/8 が角張って読みづらいため、
                  数字を含む見出しは font-sans(Inter/Noto Sans JP) で統一する。 */}
              <h3 className="mt-2 font-sans text-xl font-black tracking-wide text-text-light sm:mt-3 sm:text-2xl lg:text-3xl">
                {t(card.labelKey)}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-text-gray sm:mt-3">
                {t(card.descKey)}
              </p>
              <a
                href={card.href}
                {...EXTERNAL_LINK_PROPS}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-accent px-6 py-3.5 text-sm font-bold tracking-[0.15em] text-deep-black transition-all hover:gap-3 hover:bg-accent/90 sm:mt-8 sm:py-4"
              >
                {t(card.ctaKey)}
                <span aria-hidden className="text-base leading-none">
                  →
                </span>
              </a>
            </motion.div>
          ))}
        </div>

        {/* ===== セクション区切り ===== */}
        <div className="my-12 border-t border-text-gray/15 sm:my-16" />

        {/* ===== HYROXエリア ===== */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          <p className="text-[11px] font-semibold tracking-[0.3em] text-accent">
            {t("hyroxKicker")}
          </p>
          <h2 className="mt-2 font-sans text-2xl font-black tracking-wide text-text-light sm:text-3xl">
            {t("hyroxHeading")}
          </h2>
          <div className="mx-auto mt-4 h-[2px] w-12 bg-accent" />
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-text-gray">
            {t("hyroxDesc")}
          </p>
          <a
            href={LABOLA_HYROX_URL}
            {...EXTERNAL_LINK_PROPS}
            className="mt-7 inline-flex w-full max-w-md items-center justify-center gap-2 bg-accent px-8 py-3.5 text-sm font-bold tracking-[0.15em] text-deep-black transition-all hover:gap-3 hover:bg-accent/90 sm:w-auto sm:py-4"
          >
            {t("hyroxCta")}
            <span aria-hidden className="text-base leading-none">
              →
            </span>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
