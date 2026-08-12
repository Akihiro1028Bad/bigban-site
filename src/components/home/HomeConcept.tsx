"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import SectionUnderline from "@/components/SectionUnderline";
import { EASE } from "@/constants/motion";

/** 星雲の中心に置く青いグロー。ブランドブルー #306EC3 を薄く広げる。 */
const NEBULA_GLOW = "rgba(48, 110, 195, 0.22)";

const VIEWPORT = { once: true, margin: "-150px" } as const;

/** 詩の2行は対等。級数の差で意味を持たせない。 */
const POETRY_SIZE = "text-[clamp(1.4rem,2.8vw,1.85rem)]";

/**
 * 読点で区切り、読点を各節の末尾に残す。
 * 節ごとに inline-block で置くと、狭い幅でも「大きなムーブメント」のような
 * 語の途中ではなく読点の位置で折り返せる(文言側に <br> を持たせずに済む)。
 */
function splitByClause(text: string): string[] {
  const parts = text.split("、");
  return parts
    .map((part, i) => (i < parts.length - 1 ? `${part}、` : part))
    .filter((part) => part.length > 0);
}

/**
 * CONCEPT = 名前の由来を語る章。
 *
 * 読む順 = DOM 順 = 原文順のセンター軸一直線に置き、lead → 詩 → 説明 →
 * キャッチコピーと素直に流す。詩とキャッチコピーだけ明朝にして声色を変えるが、
 * 級数の演出や装飾では語らせず、余白と文字で組む。
 * リビールは他セクションと同じ opacity + y の標準パターンに揃える。
 */
export default function HomeConcept() {
  const t = useTranslations("HomeConcept");
  const shouldReduceMotion = useReducedMotion();

  const rise = (delay = 0) => ({
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: VIEWPORT,
    transition: { duration: 1.1, delay, ease: EASE },
  });

  return (
    <section
      id="concept"
      className="relative overflow-hidden bg-deep-black text-text-light py-16 lg:py-24"
    >
      {/* 星雲。写真 + 縦グラデ + 青グローをまとめた装飾レイヤー。 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Image
          src="/images/concept-bigbang.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-deep-black via-deep-black/70 to-deep-black" />
        <div
          className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-[180px]"
          style={{ background: NEBULA_GLOW }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-12">
        {/* Section Title */}
        <motion.div
          className="text-center mb-12 lg:mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-[clamp(2rem,22vw_-_34.5px,3rem)] leading-none sm:text-6xl lg:text-7xl font-black tracking-[0.15em]">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <SectionUnderline />
        </motion.div>

        {/* 本文はセンター軸の一直線。読む順を原文から動かさない。 */}
        <div className="mx-auto max-w-[780px] text-center">
          {/* 1. 命名の由来。 */}
          <motion.p
            className="mx-auto max-w-[36em] text-left text-[15px] leading-[2.3] text-text-light/85"
            {...rise()}
          >
            {t("lead")}
          </motion.p>

          {/* 2. 詩。明朝を使うのはこの2行だけ。2行は対等に扱う。 */}
          <motion.p
            className={`mt-14 leading-[1.9] tracking-[0.1em] text-white ${POETRY_SIZE}`}
            {...rise()}
          >
            {[t("poetry1"), t("poetry2")].map((line) => (
              <span
                key={line}
                className={`block font-mincho font-extrabold ${POETRY_SIZE}`}
              >
                {line}
              </span>
            ))}
          </motion.p>

          {/* 3. 説明。 */}
          <motion.div
            className="mx-auto mt-14 max-w-[33em] text-left text-[14px] leading-[2.3] text-text-gray"
            {...rise()}
          >
            <p className="text-[14px]">{t("description1")}</p>
            <p className="mt-[1.4em] text-[14px]">{t("description2")}</p>
          </motion.div>

          {/* 4. キャッチコピー = この章の着地。 */}
          <motion.p
            className="mt-16 font-sans font-bold text-[clamp(1.5rem,3vw,2rem)] leading-[1.8] tracking-[0.08em] text-accent"
            {...rise()}
          >
            {splitByClause(t("catchcopy")).map((clause) => (
              <span key={clause} className="inline-block">
                {clause}
              </span>
            ))}
          </motion.p>
        </div>
      </div>
    </section>
  );
}
