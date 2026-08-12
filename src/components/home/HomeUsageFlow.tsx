"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { EASE } from "@/constants/motion";

import type { ReactNode } from "react";

/**
 * メッセージ側のリッチテキストタグ。HomeLead / HomeServices と同じ手法。
 *
 * 日本語は文字単位で折り返されるため、放っておくと 390px で
 * 「コートは1/時間単位で」のように語の途中で行が割れる。nb で囲った範囲だけ
 * 折り返しを禁止して、実測で分断が起きた語を守る（表示テキストは一字も変えない）。
 */
const RICH_TAGS = {
  nb: (chunks: ReactNode) => <span className="whitespace-nowrap">{chunks}</span>,
} as const;

/**
 * 無人チェックイン + 外部予約サイトという運用は初回客に説明が要る。
 * SERVICES(何を予約するか)の直後・PRICING(いくらか)の直前に置き、
 * 「予約 → 入館 → プレー」の3手だけを示して初回予約の心理障壁を下げる。
 *
 * 新規CTAは置かない。直後の PRICING が予約CTAを持っており、
 * ここに並べると同一画面でCTAの階層が二重になる。
 */
const STEP_KEYS = ["reserve", "visit", "play"] as const;

export default function HomeUsageFlow() {
  const t = useTranslations("HomeUsageFlow");

  return (
    // PRICING と同じ純黒。PRICING 側が pt-8 lg:pt-16 と上が詰まっているため、
    // こちらの下パディングは控えめにして2セクション間の余白を釣り合わせる。
    <section
      id="flow"
      aria-labelledby="home-usage-flow-title"
      className="bg-deep-black text-text-light"
    >
      <div className="mx-auto max-w-7xl px-6 pb-10 pt-14 lg:px-12 lg:pb-12 lg:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          {/* 補助セクションなので h2 はフルサイズにせず、HomeLatestNews と同じ
              コンパクトな帯見出しに揃える。font-serif(Orbitron) に和文グリフが
              無いため、和文見出しは font-sans。 */}
          <h2
            id="home-usage-flow-title"
            className="font-sans text-base font-black tracking-[0.12em] sm:text-lg"
          >
            {t("heading")}
          </h2>
          <p className="mt-1 text-[9px] font-bold tracking-[0.2em] text-text-gray sm:text-[10px]">
            {t("headingEn")}
          </p>
        </motion.div>

        <ol className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          {STEP_KEYS.map((stepKey, i) => (
            <motion.li
              key={stepKey}
              className="border-t border-text-gray/20 pt-4"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-120px" }}
              transition={{ duration: 1.0, delay: i * 0.1, ease: EASE }}
            >
              {/* 連番は装飾。順序は ol が伝えるので支援技術には読ませない。
                  数字グリフは Orbitron にあるため font-serif を使える。 */}
              <p
                aria-hidden
                className="font-serif text-2xl font-black tracking-[0.15em] text-accent"
              >
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 font-sans text-lg font-bold tracking-wide text-text-light">
                {t(`steps.${stepKey}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-gray">
                {t.rich(`steps.${stepKey}.description`, RICH_TAGS)}
              </p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
