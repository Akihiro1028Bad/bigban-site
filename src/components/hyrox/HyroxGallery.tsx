"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

const IMAGE_SRCS = [
  "/images/hyrox/action-sandbag-carry.jpg",
  "/images/hyrox/action-lunge.jpg",
  "/images/hyrox/action-sled-push.jpg",
  "/images/hyrox/action-row.jpg",
  "/images/hyrox/action-sled-pull.jpg",
  "/images/hyrox/action-finish.jpg",
] as const;

export default function HyroxGallery() {
  const t = useTranslations("HyroxPage.gallery");
  const items = t.raw("items") as { alt: string }[];

  return (
    <section className="bg-deep-black pb-24 lg:pb-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="mb-12"
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
          <div className="mt-4 h-[3px] w-14 bg-accent" />
        </motion.div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {IMAGE_SRCS.map((src, idx) => (
            <motion.div
              key={src}
              className="group relative aspect-[4/5] overflow-hidden"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, delay: idx * 0.05, ease: EASE }}
            >
              <Image
                src={src}
                alt={items[idx]?.alt ?? ""}
                fill
                sizes="(min-width: 1024px) 33vw, 50vw"
                loading="lazy"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
