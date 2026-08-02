"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import HyroxCampaign from "@/components/hyrox/HyroxCampaign";
import { EASE } from "@/constants/motion";
import { trackCtaClick, trackLabolaEntry } from "@/lib/analytics/trackEvent";
import {
  LABOLA_PICKLEBALL_URL,
  LABOLA_HYROX_URL,
  LABOLA_SCHOOL_URL,
  EXTERNAL_LINK_PROPS,
} from "@/constants/site";
import type { LabolaEntryKind } from "@/lib/growth/labolaEvents";

interface ChoiceCard {
  tagKey: string;
  labelKey: string;
  descKey: string;
  ctaKey: string;
  href: string;
  location: string;
  // 予約先は labola に一本化済みのため、全カードが専用流入イベントを伴う。
  labolaEntryKind: LabolaEntryKind;
}

// 旧予約システム(RESERVA)からの移行は完了済みで、予約先は labola に一本化されている。
// location は移行期(8月以降カード)の値を維持する。GA4 の reservation_click を
// 移行前後で連続した系列として見るため、意図的に改名していない。
const COURT_CARD: ChoiceCard = {
  tagKey: "courtTag",
  labelKey: "courtLabel",
  descKey: "courtDesc",
  ctaKey: "courtCta",
  href: LABOLA_PICKLEBALL_URL,
  location: "reserve_choice_august",
  labolaEntryKind: "rental",
};

const PICKLEBALL_CARDS: readonly ChoiceCard[] = [COURT_CARD];

// HYROX は「エリア利用（枠貸し）」と「レッスン / クラス」の2カテゴリに分ける。
// レッスン/クラスは現状 HYROX のみのため HYROX セクション内に内包する。
const HYROX_AREA_CARD: ChoiceCard = {
  tagKey: "hyroxAreaTag",
  labelKey: "hyroxAreaLabel",
  descKey: "hyroxAreaDesc",
  ctaKey: "hyroxAreaCta",
  href: LABOLA_HYROX_URL,
  location: "reserve_choice_hyrox_area",
  labolaEntryKind: "rental",
};

const HYROX_LESSON_CARD: ChoiceCard = {
  tagKey: "lessonKicker",
  labelKey: "lessonHeading",
  descKey: "lessonDesc",
  ctaKey: "lessonCta",
  href: LABOLA_SCHOOL_URL,
  location: "reserve_choice_hyrox_lesson",
  labolaEntryKind: "program",
};

const HYROX_CARDS: readonly ChoiceCard[] = [HYROX_AREA_CARD, HYROX_LESSON_CARD];

// カードを並べる共通グリッド（ピックル／HYROX で共用）。
function ChoiceCardGrid({ cards }: { cards: readonly ChoiceCard[] }) {
  const t = useTranslations("Reserve.choice");
  // 1枚のときに2カラムのままだと左半分へ寄って崩れるため、中央寄せの1カラムにする。
  const layoutClassName =
    cards.length === 1
      ? "mx-auto max-w-xl grid-cols-1"
      : "grid-cols-1 md:grid-cols-2";

  return (
    <div className={`grid gap-4 sm:gap-6 lg:gap-8 ${layoutClassName}`}>
      {cards.map((card, i) => (
        <motion.div
          key={card.ctaKey}
          className="flex flex-col rounded-sm border border-accent/40 border-t-2 border-t-accent bg-white/[0.02] p-5 sm:p-8 lg:p-10"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, delay: i * 0.12, ease: EASE }}
        >
          <p className="text-[10px] tracking-[0.25em] text-accent">
            {t(card.tagKey)}
          </p>
          {/* font-serif(Orbitron) のフォントスタックには和文フォントが無いため、
              和文を含む見出しは font-sans(Inter/Noto Sans JP) で統一する。 */}
          <h3 className="mt-2 font-sans text-xl font-black tracking-wide text-text-light sm:mt-3 sm:text-2xl lg:text-3xl">
            {t(card.labelKey)}
          </h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-text-gray sm:mt-3">
            {t(card.descKey)}
          </p>
          <a
            href={card.href}
            {...EXTERNAL_LINK_PROPS}
            onClick={() => {
              trackCtaClick("reservation", card.location, t(card.ctaKey));
              trackLabolaEntry(card.labolaEntryKind);
            }}
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
  );
}

// セクション見出し（キッカー＋見出し＋説明）。ピックル／HYROX で共用。
function SectionHeading({
  kickerKey,
  headingKey,
  descKey,
}: {
  kickerKey: string;
  headingKey: string;
  descKey: string;
}) {
  const t = useTranslations("Reserve.choice");

  return (
    <motion.div
      className="mb-8 text-center"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 1.0, ease: EASE }}
    >
      <p className="text-[11px] font-semibold tracking-[0.3em] text-accent">
        {t(kickerKey)}
      </p>
      <h2 className="mt-2 font-sans text-2xl font-black tracking-wide text-text-light sm:text-3xl">
        {t(headingKey)}
      </h2>
      <div className="mx-auto mt-4 h-[2px] w-12 bg-accent" />
      <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-text-light/80">
        {t(descKey)}
      </p>
    </motion.div>
  );
}

export default function ReserveChoice() {
  return (
    <section className="bg-deep-black pb-16 lg:pb-24">
      <div className="mx-auto max-w-5xl px-6 lg:px-12">
        {/* ===== ピックルボールコート ===== */}
        <SectionHeading
          kickerKey="pickleballKicker"
          headingKey="pickleballHeading"
          descKey="pickleballDesc"
        />
        <ChoiceCardGrid cards={PICKLEBALL_CARDS} />

        {/* ===== セクション区切り ===== */}
        <div className="my-12 border-t border-text-gray/15 sm:my-16" />

        {/* ===== HYROXエリア（エリア利用 / レッスン・クラス） ===== */}
        <SectionHeading
          kickerKey="hyroxKicker"
          headingKey="hyroxHeading"
          descKey="hyroxDesc"
        />
        {/* オープン記念＆千葉大会応援キャンペーン告知（期間外は自動非表示） */}
        <HyroxCampaign />
        <ChoiceCardGrid cards={HYROX_CARDS} />
      </div>
    </section>
  );
}
