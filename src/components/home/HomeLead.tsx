"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { EASE } from "@/constants/motion";

import type { ReactNode } from "react";

/**
 * メッセージ側のリッチテキストタグ。デッキ・本文・HYROX の3段落で共有する。
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

/**
 * ヒーロー直下に置く施設の自己紹介。
 *
 * ホームの本文はキャッチコピーと数値ラベルが中心で、「この施設が何か」を
 * 説明する散文が存在しなかった。その結果 Google は meta description を採らず、
 * フッターのブランド表記+ナビ文字列を検索スニペットに使っていた (#380)。
 * ここは description を本文側で裏付けるための文章であり、
 * 隠しテキストにはせず読める本文として置く。
 */
export default function HomeLead() {
  const t = useTranslations("HomeLead");

  return (
    <section className="bg-deep-black text-text-light">
      <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14 lg:px-12 lg:py-20">
        <motion.div
          className="flex gap-5 sm:gap-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.3em] text-text-gray">
              {t("kicker")}
            </p>
            {/* 大きい文字ほど行間は詰める。モバイルの 1.9 は行間が空きすぎて縦に伸びていた。 */}
            <p className="mt-5 max-w-3xl text-lg font-medium leading-[1.5] text-text-light sm:text-2xl sm:leading-[1.7]">
              {t.rich("deck", RICH_TAGS)}
            </p>
            {/* 本文もモバイルは行間と段落間を詰める。行送りを詰めた分、段落間も同じ比率で縮める。 */}
            <p className="mt-5 max-w-2xl text-sm leading-[1.9] text-text-light/90 sm:mt-6 sm:text-base sm:leading-[2.2]">
              {t.rich("body", RICH_TAGS)}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-[1.9] text-text-light/90 sm:mt-4 sm:text-base sm:leading-[2.2]">
              {t.rich("bodyHyrox", RICH_TAGS)}
            </p>
          </div>
          {/* スパイン: 本文ブロックの高さいっぱいに走るヘアラインと、その上端に乗る縦書きラベル。 */}
          <div className="self-stretch border-l border-text-gray/20 pl-3">
            <span
              className="whitespace-nowrap text-[11px] tracking-[0.4em] text-text-gray/60"
              style={{ writingMode: "vertical-rl" }}
            >
              {t("sideLabel")}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
