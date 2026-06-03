"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HyroxPicklePromo() {
  const t = useTranslations("HyroxPage.picklePromo");

  return (
    <section className="bg-deep-black text-text-light">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-12 lg:py-28">
        <motion.div
          className="relative grid grid-cols-1 overflow-hidden rounded-none border border-text-gray/15 lg:grid-cols-2 lg:rounded-sm"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.2, ease: EASE }}
        >
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />

          {/* テキスト（左） */}
          <div className="flex flex-col justify-center px-8 py-10 lg:px-12 lg:py-16">
            <span className="mb-3 text-[10px] uppercase tracking-[0.3em] text-accent">
              {t("kicker")}
              <span className="ml-2 normal-case tracking-normal text-text-gray">
                {t("kickerJa")}
              </span>
            </span>
            <h2 className="font-serif text-4xl font-black tracking-[0.1em] lg:text-5xl">
              {t("title")}
            </h2>
            <p className="mt-2 text-xs tracking-[0.2em] text-text-gray">
              {t("titleJa")}
            </p>
            <p className="mt-5 text-sm leading-relaxed text-text-gray">
              {t("description")}
            </p>
            <Link
              href="/"
              className="mt-7 inline-block self-start bg-accent px-8 py-3 text-xs font-bold uppercase tracking-widest text-deep-black transition-colors hover:bg-accent/90"
            >
              {t("cta")}
            </Link>
          </div>

          {/* 画像（右）：コート写真 */}
          <div className="relative order-first aspect-[16/10] lg:order-last lg:aspect-auto lg:min-h-[320px]">
            <Image
              src="/images/facility.webp"
              alt={t("courtImageAlt")}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover opacity-90"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
