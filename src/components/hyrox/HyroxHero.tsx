"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { RESERVE_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HyroxHero() {
  const t = useTranslations("HyroxPage.hero");

  return (
    <section className="relative min-h-[80vh] flex items-center bg-deep-black overflow-hidden">
      <Image
        src="/images/hyrox/hero.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover opacity-80"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-deep-black/70 via-deep-black/20 to-transparent" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-12 py-32 w-full">
        <motion.p
          className="text-xs tracking-[0.3em] text-text-gray uppercase mb-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.1, ease: EASE }}
        >
          {t("kicker")}
        </motion.p>
        <motion.h1
          className="font-serif text-6xl sm:text-7xl lg:text-8xl font-black tracking-[0.1em] text-text-light"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.2, ease: EASE }}
        >
          {t("title")}
        </motion.h1>
        {t("titleJa") ? (
          <motion.p
            className="mt-3 text-sm sm:text-base tracking-[0.35em] text-text-gray"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.0, delay: 0.35, ease: EASE }}
          >
            {t("titleJa")}
          </motion.p>
        ) : null}
        <div className="mt-4 w-14 h-[3px] bg-accent" />
        <p className="mt-6 text-text-gray text-sm sm:text-base max-w-xl leading-relaxed">
          {t("lead")}
        </p>
        <a
          href={RESERVE_URL}
          {...EXTERNAL_LINK_PROPS}
          className="inline-block mt-8 bg-accent text-deep-black px-8 py-3 text-xs font-bold uppercase tracking-widest hover:bg-accent/90 transition-colors"
        >
          {t("cta")}
        </a>
      </div>
    </section>
  );
}
