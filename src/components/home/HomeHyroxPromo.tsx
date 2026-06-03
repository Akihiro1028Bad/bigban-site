"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { EASE } from "@/constants/motion";


export default function HomeHyroxPromo() {
  const t = useTranslations("HomeHyroxPromo");
  const kickerJa = t("kickerJa");

  return (
    <section className="bg-deep-black text-text-light">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-12 lg:py-20">
        <motion.div
          className="group relative flex min-h-[460px] items-end overflow-hidden rounded-sm border border-text-gray/15 md:items-center lg:min-h-[520px]"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.2, ease: EASE }}
        >
          {/* 背景画像（モバイルは中央、PCは右寄りに被写体を配置） */}
          <Image
            src="/images/hyrox/hero.jpg"
            alt={t("imageAlt")}
            fill
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="object-cover object-[60%_30%] transition-transform duration-[1200ms] ease-out group-hover:scale-105 md:object-[70%_center]"
          />
          {/* モバイル: 下方向のスクリム（写真を見せつつ下部の文字を読みやすく） */}
          <div className="absolute inset-0 bg-gradient-to-t from-deep-black from-30% via-deep-black/80 to-deep-black/25 md:hidden" />
          {/* PC: 左重心のグラデーション */}
          <div className="absolute inset-0 hidden bg-gradient-to-r from-deep-black via-deep-black/70 to-deep-black/20 md:block" />
          <div className="absolute inset-0 hidden bg-gradient-to-t from-deep-black/80 to-transparent md:block" />
          {/* アクセントのトップライン */}
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />

          {/* コンテンツ */}
          <div className="relative max-w-xl px-8 py-12 lg:px-14 lg:py-16">
            <span className="text-[10px] uppercase tracking-[0.3em] text-accent">
              {t("kicker")}
              {kickerJa ? (
                <span className="ml-2 normal-case tracking-normal text-text-gray">
                  {kickerJa}
                </span>
              ) : null}
            </span>

            <h2 className="mt-4 font-serif text-6xl font-black leading-none tracking-[0.08em] sm:text-7xl">
              {t("title")}
            </h2>
            <p className="mt-2 text-xs tracking-[0.35em] text-text-gray">
              {t("titleJa")}
            </p>

            <p className="mt-5 font-sans text-xl font-black tracking-tight text-text-light sm:text-2xl">
              {t("tagline")}
            </p>

            <p className="mt-5 max-w-md text-sm leading-relaxed text-text-gray">
              {t("description")}
            </p>

            <Link
              href="/hyrox"
              className="mt-8 inline-flex items-center gap-2 self-start bg-accent px-8 py-3 text-xs font-bold uppercase tracking-widest text-deep-black transition-all hover:gap-3 hover:bg-accent/90"
            >
              {t("cta")}
              <span aria-hidden className="text-base leading-none">
                →
              </span>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
