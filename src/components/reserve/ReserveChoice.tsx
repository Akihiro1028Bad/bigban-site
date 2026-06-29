"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { EASE } from "@/constants/motion";
import {
  RESERVE_URL,
  LABOLA_RESERVE_URL,
  EXTERNAL_LINK_PROPS,
} from "@/constants/site";

interface ChoiceCard {
  labelKey: "julyLabel" | "augLabel";
  periodKey: "julyPeriod" | "augPeriod";
  descKey: "julyDesc" | "augDesc";
  ctaKey: "julyCta" | "augCta";
  href: string;
  isPrimary: boolean;
}

// 8月になったら JULY_CARD（7月までの予約=RESERVA）を CARDS から削除する。
const JULY_CARD: ChoiceCard = {
  labelKey: "julyLabel",
  periodKey: "julyPeriod",
  descKey: "julyDesc",
  ctaKey: "julyCta",
  href: RESERVE_URL,
  isPrimary: false,
};

const AUGUST_CARD: ChoiceCard = {
  labelKey: "augLabel",
  periodKey: "augPeriod",
  descKey: "augDesc",
  ctaKey: "augCta",
  href: LABOLA_RESERVE_URL,
  isPrimary: true,
};

const CARDS: readonly ChoiceCard[] = [JULY_CARD, AUGUST_CARD];

export default function ReserveChoice() {
  const t = useTranslations("Reserve.choice");

  return (
    <section className="bg-deep-black pb-16 lg:pb-24">
      <div className="mx-auto max-w-5xl px-6 lg:px-12">
        <motion.p
          className="mx-auto mb-10 max-w-2xl text-center text-sm leading-relaxed text-text-light/80"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          {t("notice")}
        </motion.p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
          {CARDS.map((card, i) => (
            <motion.div
              key={card.ctaKey}
              className={`flex flex-col rounded-sm border bg-white/[0.02] p-8 lg:p-10 ${
                card.isPrimary
                  ? "border-accent/40 border-t-2 border-t-accent"
                  : "border-text-gray/15"
              }`}
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
              <h3 className="mt-3 font-sans text-2xl font-black tracking-wide text-text-light lg:text-3xl">
                {t(card.labelKey)}
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-text-gray">
                {t(card.descKey)}
              </p>
              <a
                href={card.href}
                {...EXTERNAL_LINK_PROPS}
                className={`mt-8 inline-flex w-full items-center justify-center gap-2 px-6 py-4 text-sm font-bold tracking-[0.15em] transition-all hover:gap-3 ${
                  card.isPrimary
                    ? "bg-accent text-deep-black hover:bg-accent/90"
                    : "border border-accent/40 text-accent hover:border-accent"
                }`}
              >
                {t(card.ctaKey)}
                <span aria-hidden className="text-base leading-none">
                  →
                </span>
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
