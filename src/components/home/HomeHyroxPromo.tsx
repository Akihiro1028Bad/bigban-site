"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HomeHyroxPromo() {
  const t = useTranslations("HomeHyroxPromo");
  const kickerJa = t("kickerJa");

  return (
    <section className="bg-deep-black text-text-light">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-12 lg:py-20">
        <motion.div
          className="group relative flex min-h-[440px] items-center overflow-hidden rounded-sm border border-text-gray/15 lg:min-h-[520px]"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.2, ease: EASE }}
        >
          {/* 背景画像 */}
          <Image
            src="/images/hyrox/hero.jpg"
            alt={t("imageAlt")}
            fill
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="object-cover object-[70%_center] transition-transform duration-[1200ms] ease-out group-hover:scale-105"
          />
          {/* 左重心のグラデーション */}
          <div className="absolute inset-0 bg-gradient-to-r from-deep-black via-deep-black/70 to-deep-black/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-deep-black/80 to-transparent" />
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
