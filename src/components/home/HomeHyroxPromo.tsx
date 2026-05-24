"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function HomeHyroxPromo() {
  const t = useTranslations("HomeHyroxPromo");

  return (
    <section className="bg-deep-black text-text-light">
      <div className="mx-auto max-w-7xl px-6 lg:px-12 py-12 lg:py-28">
        <motion.div
          className="relative grid grid-cols-1 lg:grid-cols-2 overflow-hidden rounded-none lg:rounded-sm border border-text-gray/15"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.2, ease: EASE }}
        >
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />
          <div className="relative aspect-[16/10] lg:aspect-auto lg:min-h-[320px]">
            <Image
              src="/images/comingsoon.jpg"
              alt=""
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover opacity-60"
            />
          </div>
          <div className="px-8 py-10 lg:px-12 lg:py-16 flex flex-col justify-center">
            <span className="text-[10px] tracking-[0.3em] text-accent uppercase mb-3">
              {t("kicker")}
            </span>
            <h2 className="font-serif text-4xl lg:text-5xl font-black tracking-[0.1em]">
              {t("title")}
            </h2>
            <p className="text-xs tracking-[0.2em] text-text-gray mt-2">
              {t("titleEn")}
            </p>
            <p className="text-sm text-text-gray leading-relaxed mt-5">
              {t("description")}
            </p>
            <Link
              href="/hyrox"
              className="inline-block mt-7 self-start bg-accent text-deep-black px-8 py-3 text-xs font-bold uppercase tracking-widest hover:bg-accent/90 transition-colors"
            >
              {t("cta")}
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
