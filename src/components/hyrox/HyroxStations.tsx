"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { HYROX_STATIONS } from "./stations";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

// 各種目に割り当てる写真（一部は暫定の充当）。HYROX_STATIONS と同順。
const STATION_IMAGES = [
  "/images/hyrox/action-skierg.jpg",
  "/images/hyrox/action-sled-push.jpg",
  "/images/hyrox/action-sled-pull.jpg",
  "/images/hyrox/action-finish.jpg",
  "/images/hyrox/action-row.jpg",
  "/images/hyrox/action-sandbag-carry.jpg",
  "/images/hyrox/action-lunge.jpg",
  "/images/hyrox/arena-band.jpg",
] as const;

// 「WHAT IS HYROX」セクション内に内包されるサブブロック（種目一覧）。
export default function HyroxStations() {
  const t = useTranslations("HyroxPage.stations");

  return (
    <div className="mt-12 lg:mt-16">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {HYROX_STATIONS.map((station, i) => (
          <motion.div
            key={station.key}
            className="group relative overflow-hidden border-t-2 border-t-transparent bg-white/[0.02] transition-colors hover:border-t-accent"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, delay: 0.05 + i * 0.06, ease: EASE }}
          >
            <div className="relative aspect-[4/5] overflow-hidden">
              <Image
                src={STATION_IMAGES[i]}
                alt=""
                fill
                sizes="(min-width: 1024px) 25vw, 50vw"
                loading="lazy"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-deep-black via-deep-black/30 to-transparent" />
              <span className="absolute left-3 top-3 font-serif text-2xl text-accent">
                {station.number}
              </span>
              <div className="absolute inset-x-0 bottom-0 p-4">
                <span className="block text-sm font-bold tracking-wide text-text-light">
                  {t(`${station.key}.name`)}
                </span>
                <span className="mt-0.5 block text-[11px] text-text-gray">
                  {t(`${station.key}.nameJa`)}
                </span>
              </div>
            </div>
            <p className="px-4 py-4 text-xs leading-relaxed text-text-gray">
              {t(`${station.key}.description`)}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
