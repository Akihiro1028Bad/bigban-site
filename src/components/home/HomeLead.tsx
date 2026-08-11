"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { EASE } from "@/constants/motion";

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
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-12 lg:py-20">
        <motion.div
          className="max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-text-gray">
            {t("kicker")}
          </p>
          <p className="mt-5 text-sm leading-[2.2] text-text-light/90 sm:text-base">
            {t("body")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
