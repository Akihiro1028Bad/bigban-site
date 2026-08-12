"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { Link } from "@/i18n/navigation";
import { EASE } from "@/constants/motion";
import { reserveHref } from "@/constants/site";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

import type { ReactNode } from "react";

/**
 * リード文側のリッチテキストタグ。デッキ・本文・HYROX の3段落で共有する。
 *
 * 日本語は文字単位で折り返されるため、放っておくと「空調完/備」のように
 * 語の途中で行が割れる。nb で囲った範囲だけ折り返しを禁止して、
 * 実測で分断が起きた語を守る（表示テキストは一字も変えない）。
 */
const RICH_TAGS = {
  strong: (chunks: ReactNode) => (
    <strong className="font-semibold text-text-light">{chunks}</strong>
  ),
  nb: (chunks: ReactNode) => <span className="whitespace-nowrap">{chunks}</span>,
} as const;

/** 2ゾーン共通の画像サイズ指定(lg で 2 カラムに割れる)。 */
const ZONE_IMAGE_SIZES = "(min-width: 1024px) 576px, 100vw";

/** 極小の英語キッカー。和文見出しが主・英語が従という主従関係を保つ。 */
const ZONE_KICKER_CLASS = "mt-6 text-[10px] tracking-[0.25em] text-text-gray";

/** ゾーン見出し。施設概要(text-2xl)より一段小さく、2カラムに収める。 */
const ZONE_HEADING_CLASS =
  "mt-2 font-sans text-xl font-bold tracking-wide text-text-light sm:text-2xl";

const ZONE_BODY_CLASS = "mt-4 text-sm leading-relaxed text-text-gray";

/** ゾーン固有の事実は表に入れず、両ゾーンに共通する情報だけを並べる。 */
const INFO_ROW_KEYS = [
  "hours",
  "access",
  "environment",
  "equipment",
  "rental",
  "checkin",
] as const;

/**
 * ホームの FACILITY セクション。
 *
 * 「施設について」のリード文（旧 HomeLead）と FACILITY セクションを統合した面。
 * リード文は #380 の検索スニペット対策で入れた散文で、Google が meta description を
 * 採らずフッター文字列をスニペットに使っていた問題への手当て。文言は HomeLead
 * 名前空間のまま据え置き、隠しテキストにはせず読める本文としてここに置く。
 *
 * 本体はツインゾーン + 施設概要表。コートとトレーニングエリアを同サイズの写真・
 * 同レベルの見出しで並べ、「ピックルボールとトレーニングの両方がある施設」だと
 * 一目で分かるようにする。表には両ゾーンに共通する確定情報だけを残す。
 */
export default function HomeFacility() {
  const t = useTranslations("HomeFacility");
  const tLead = useTranslations("HomeLead");

  return (
    <section id="facility" className="bg-deep-black py-24 text-text-light lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* Section Title */}
        <motion.div
          className="mb-12 text-center lg:mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-5xl font-black tracking-[0.15em] text-text-light sm:text-6xl lg:text-7xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs tracking-[0.25em] text-text-gray sm:text-sm">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 h-[3px] w-14 bg-accent" />
        </motion.div>

        {/* リード文プローズ。
            単独セクションだった頃のキッカー "ABOUT THE FACILITY" と縦書きスパイン
            「施設について」は、いずれもセクション見出し(FACILITY / 施設・設備)と
            同じことを言うため描画しない。ラベルを外すとヘアラインだけが意味を失うので
            スパインごと除去した。本文の文言は SEO 実験中のため一字も変えていない。 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          {/* 大きい文字ほど行間は詰める。モバイルの 1.9 は行間が空きすぎて縦に伸びていた。 */}
          <p className="max-w-3xl text-lg font-medium leading-[1.5] text-text-light sm:text-2xl sm:leading-[1.7]">
            {tLead.rich("deck", RICH_TAGS)}
          </p>
          {/* 本文もモバイルは行間と段落間を詰める。行送りを詰めた分、段落間も同じ比率で縮める。 */}
          <p className="mt-5 max-w-2xl text-sm leading-[1.9] text-text-light/90 sm:mt-6 sm:text-base sm:leading-[2.2]">
            {tLead.rich("body", RICH_TAGS)}
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-[1.9] text-text-light/90 sm:mt-4 sm:text-base sm:leading-[2.2]">
            {tLead.rich("bodyHyrox", RICH_TAGS)}
          </p>
        </motion.div>

        {/* ツインゾーン: 同サイズ写真 + 同レベル見出しで、2つのゾーンを同格に見せる。 */}
        <div className="mt-12 grid grid-cols-1 gap-6 lg:mt-16 lg:grid-cols-2 lg:gap-8">
          {/* ゾーン1: ピックルボールコート */}
          <motion.div
            className="min-w-0"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1.1, ease: EASE }}
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-sm">
              <Image
                src="/images/facility.webp"
                alt={t("zones.court.imageAlt")}
                fill
                sizes={ZONE_IMAGE_SIZES}
                className="object-cover"
              />
            </div>
            <p className={ZONE_KICKER_CLASS}>{t("zones.court.titleEn")}</p>
            <h3 className={ZONE_HEADING_CLASS}>{t("zones.court.titleJa")}</h3>
            <p className={ZONE_BODY_CLASS}>
              {t.rich("zones.court.description", RICH_TAGS)}
            </p>
          </motion.div>

          {/* ゾーン2: HYROXトレーニングエリア */}
          <motion.div
            className="min-w-0"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1.1, delay: 0.1, ease: EASE }}
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-sm">
              <Image
                src="/images/hyrox/facility-4.jpg"
                alt={t("zones.training.imageAlt")}
                fill
                sizes={ZONE_IMAGE_SIZES}
                className="object-cover"
              />
            </div>
            <p className={ZONE_KICKER_CLASS}>{t("zones.training.titleEn")}</p>
            <h3 className={ZONE_HEADING_CLASS}>{t("zones.training.titleJa")}</h3>
            <p className={ZONE_BODY_CLASS}>
              {t.rich("zones.training.description", RICH_TAGS)}
            </p>
            <Link
              href="/hyrox"
              onClick={() =>
                trackCtaClick("contentClick", "home_facility_hyrox", "hyrox")
              }
              className="mt-4 inline-flex items-center gap-2 text-sm text-accent transition-all duration-300 hover:gap-3"
            >
              {t("zones.training.linkLabel")}
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </motion.div>
        </div>

        {/* 施設概要: 日本の会社概要ページの文法に合わせた2列の罫線表。 */}
        <div className="mt-16 lg:mt-20">
          <p className="text-[10px] tracking-[0.25em] text-text-gray">
            {t("info.headingEn")}
          </p>
          <h3 className="mt-2 font-sans text-2xl font-bold tracking-wide text-text-light sm:text-3xl">
            {t("info.heading")}
          </h3>
          <dl className="mt-6 border-t border-text-gray/15 lg:mt-8">
            {INFO_ROW_KEYS.map((rowKey, i) => (
              <motion.div
                key={rowKey}
                className="flex gap-4 border-b border-text-gray/15 py-4 sm:gap-8 sm:py-5"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.9, delay: i * 0.05, ease: EASE }}
              >
                {/* 項目名列は幅を固定して、行をまたいでも内容の左端が揃うようにする。 */}
                <dt className="w-28 shrink-0 pt-0.5 text-sm text-text-gray sm:w-36">
                  {t(`info.${rowKey}.label`)}
                </dt>
                <dd className="min-w-0 flex-1 text-sm leading-[1.9] text-text-light sm:text-base">
                  {t.rich(`info.${rowKey}.value`, RICH_TAGS)}
                </dd>
              </motion.div>
            ))}
          </dl>
        </div>

        {/* 予約導線。
            統合でこのセクションがヒーロー直後の最初の章になり、SERVICES の予約カード群
            までは約3,000px 離れた。ここで納得した人がすぐ動けるよう、テキストリンクから
            枠線ボタンに引き上げる。ベタ塗りは主要CTA(ヒーロー/ナビ/SERVICES/PRICING)に
            温存し、枠線でその一段下という階層を保つ。 */}
        <motion.div
          className="mt-16 text-center lg:mt-20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <Link
            href={reserveHref("pickleball")}
            onClick={() =>
              trackCtaClick("reserveEntry", "home_facility_reserve", t("reserveCta"))
            }
            className="group inline-flex items-center justify-center gap-1.5 border border-accent px-8 py-3.5 text-sm font-bold tracking-wider text-accent transition-colors hover:bg-accent hover:text-deep-black"
          >
            {t("reserveCta")}
            <span
              aria-hidden
              className="text-base leading-none transition-transform group-hover:translate-x-0.5"
            >
              &rarr;
            </span>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
