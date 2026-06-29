"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { EASE } from "@/constants/motion";
import { RESERVE_PATH } from "@/constants/site";


// サービス key と写真を 1:1 で明示的に紐づける。
// 翻訳ファイル側の items 並び順に依存しないため、順序変更で取り違えない。
const SERVICE_IMAGE_BY_KEY: Record<string, string> = {
  rental: "/images/hyrox/service-rental-race.jpg",
  trial: "/images/hyrox/service-trial-race.jpg",
  group: "/images/hyrox/service-group-race.jpg",
};

interface ServiceItem {
  key: string;
  titleEn: string;
  titleJa: string;
  description: string;
  imageAlt: string;
}

export default function HyroxServices() {
  const t = useTranslations("HyroxPage.services");
  // t.raw は unknown を返すため、システム境界として配列であることを検証する。
  const rawItems = t.raw("items");
  const items: ServiceItem[] = Array.isArray(rawItems)
    ? (rawItems as ServiceItem[])
    : [];

  return (
    <section className="bg-deep-black py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* 見出し */}
        <motion.div
          className="mb-12 text-center lg:mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl font-black tracking-[0.15em] text-text-light sm:text-5xl lg:text-6xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs tracking-[0.25em] text-text-gray sm:text-sm">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 h-[3px] w-14 bg-accent" />
          <p className="mx-auto mt-8 max-w-2xl text-sm leading-loose text-text-gray lg:text-base">
            {t("lead")}
          </p>
        </motion.div>

        {/* サービスカード */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
          {items.map((item, i) => (
            <motion.article
              key={item.key}
              className="group relative flex flex-col overflow-hidden rounded-sm border border-white/10 bg-deep-black transition-colors duration-500 hover:border-accent/50"
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-120px" }}
              transition={{ duration: 1.0, delay: i * 0.12, ease: EASE }}
            >
              {/* 画像＋タイトルオーバーレイ */}
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={SERVICE_IMAGE_BY_KEY[item.key]}
                  alt={item.imageAlt}
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="object-cover grayscale transition-all duration-700 group-hover:scale-105 group-hover:grayscale-0"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-deep-black via-deep-black/40 to-transparent" />
                {/* タイトル */}
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <h3 className="font-serif text-2xl font-black tracking-wide text-text-light lg:text-3xl">
                    {item.titleEn}
                  </h3>
                  <p className="mt-1 text-xs tracking-[0.2em] text-accent/90">
                    {item.titleJa}
                  </p>
                </div>
              </div>

              {/* 本文＋CTA */}
              <div className="flex flex-1 flex-col p-6 lg:p-7">
                <p className="flex-1 text-sm leading-relaxed text-text-light/75">
                  {item.description}
                </p>
                {/* 予約案内ページ(/reserve)へ誘導 */}
                <Link
                  href={RESERVE_PATH}
                  aria-label={`${item.titleEn} ${t("reserveCta")}`}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 border border-accent/30 px-5 py-3 text-accent transition-colors hover:bg-accent hover:text-deep-black"
                >
                  <span className="text-sm font-bold tracking-[0.15em]">
                    {t("reserveCta")}
                  </span>
                </Link>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
