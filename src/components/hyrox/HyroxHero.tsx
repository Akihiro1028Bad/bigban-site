"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { RESERVE_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";
import { EASE } from "@/constants/motion";


export default function HyroxHero() {
  const t = useTranslations("HyroxPage.hero");
  const tc = useTranslations("HyroxPage.concept");
  const words = tc.raw("words") as string[];

  return (
    <section className="relative flex min-h-screen items-center overflow-hidden bg-deep-black">
      <Image
        src="/images/hyrox/hero.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-70"
      />
      {/* 下→上の暗幕 */}
      <div className="absolute inset-0 bg-gradient-to-t from-deep-black via-deep-black/55 to-deep-black/25" />
      {/* 左→右の暗幕（テキスト可読性。モバイルは強め） */}
      <div className="absolute inset-0 bg-gradient-to-r from-deep-black/85 via-deep-black/35 to-transparent sm:from-deep-black/70 sm:via-deep-black/10" />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-28 sm:py-32 lg:px-12">
        {/* タイトル */}
        <motion.h1
          className="font-serif text-6xl font-black leading-none tracking-[0.06em] text-text-light sm:text-8xl lg:text-9xl"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.1, ease: EASE }}
        >
          {t("title")}
        </motion.h1>
        <motion.p
          className="mt-3 text-sm tracking-[0.4em] text-text-gray sm:text-base"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.0, delay: 0.3, ease: EASE }}
        >
          {t("titleJa")}
        </motion.p>

        {/* キネティックな4つの動詞 */}
        <div className="mt-10 flex flex-wrap gap-x-5 gap-y-1">
          {words.map((word, i) => (
            <motion.span
              key={word}
              className="font-sans text-4xl font-black tracking-tight text-text-light sm:text-5xl lg:text-6xl"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.45 + i * 0.12, ease: EASE }}
            >
              {word}
            </motion.span>
          ))}
        </div>

        {/* 宣言文 */}
        <motion.div
          className="mt-10 max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 1.0, ease: EASE }}
        >
          <div className="mb-6 h-[3px] w-16 bg-accent" />
          <p className="text-base leading-relaxed text-text-light sm:text-lg lg:text-xl">
            {tc.rich("body", {
              accent: (chunks) => (
                <span className="font-bold text-accent">{chunks}</span>
              ),
              strong: (chunks) => <span className="font-bold">{chunks}</span>,
            })}
          </p>
        </motion.div>

        {/* CTA */}
        <motion.a
          href={RESERVE_URL}
          {...EXTERNAL_LINK_PROPS}
          className="mt-10 inline-block bg-accent px-8 py-3 text-xs font-bold uppercase tracking-widest text-deep-black transition-colors hover:bg-accent/90"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 1.15, ease: EASE }}
        >
          {t("cta")}
        </motion.a>
      </div>
    </section>
  );
}
