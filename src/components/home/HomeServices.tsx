"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  RESERVE_URL,
  TENNISBEAR_EVENTS_URL,
  EXTERNAL_LINK_PROPS,
} from "@/constants/site";
import { EASE } from "@/constants/motion";

interface ServiceConfig {
  number: string;
  key: string;
  isReversed: boolean;
  isDark: boolean;
  imageSrc: string;
  imageAlt: string;
  hasCta: boolean;
  ctaUrl?: string;
}

const SERVICES: ServiceConfig[] = [
  { number: "01", key: "service01", isReversed: false, isDark: true, imageSrc: "/images/rental.webp", imageAlt: "Court rental", hasCta: true, ctaUrl: RESERVE_URL },
  { number: "02", key: "service02", isReversed: true, isDark: false, imageSrc: "/images/lesson.jpg", imageAlt: "Lessons & clinics", hasCta: false },
  { number: "03", key: "service03", isReversed: false, isDark: true, imageSrc: "/images/training.jpg", imageAlt: "Training program", hasCta: false },
  { number: "04", key: "service04", isReversed: true, isDark: false, imageSrc: "/images/tournament.jpg", imageAlt: "Tournaments & leagues", hasCta: false },
  { number: "05", key: "service05", isReversed: false, isDark: true, imageSrc: "/images/event.jpg", imageAlt: "Events", hasCta: true, ctaUrl: TENNISBEAR_EVENTS_URL },
];


export default function HomeServices() {
  const t = useTranslations("HomeServices");

  return (
    <section id="services">
      {/* Section Title */}
      <div className="bg-deep-black text-text-light pt-8 lg:pt-12">
        <motion.div
          className="text-center mb-6 lg:mb-8 mx-auto max-w-7xl px-6 lg:px-12"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-black tracking-[0.15em]">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>
      </div>
      {SERVICES.map((service) => (
        <div
          key={service.number}
          data-service-row
          className={
            service.isDark
              ? "bg-deep-black text-text-light"
              : "bg-off-white text-text-dark"
          }
        >
          <div
            className={`mx-auto max-w-7xl px-6 lg:px-12 py-12 lg:py-28 flex flex-col ${
              service.isReversed ? "lg:flex-row-reverse" : "lg:flex-row"
            } gap-8 lg:gap-16 items-center`}
          >
            {/* Image — モバイル時は親(px-6)の左右パディング(1.5rem × 2 = 3rem)を負マージンで打ち消し、edge-to-edge 表示にする */}
            <motion.div
              className="relative w-[calc(100%+3rem)] lg:w-[60%] aspect-[16/10] rounded-none lg:rounded-sm overflow-hidden -mx-6 lg:mx-0"
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-150px" }}
              transition={{ duration: 1.2, ease: EASE }}
            >
              <Image
                src={service.imageSrc}
                alt={service.imageAlt}
                fill
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="object-cover"
              />
            </motion.div>

            {/* Text content */}
            <motion.div
              className="w-full lg:w-[40%]"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-150px" }}
              transition={{ duration: 1.1, delay: 0.15, ease: EASE }}
            >
              <span className="font-serif text-5xl lg:text-7xl text-accent block mb-4">
                {service.number}
              </span>
              <h3 className="font-serif text-2xl lg:text-4xl mb-2">
                {t(`${service.key}.titleJa`)}
              </h3>
              <p className="text-xs tracking-[0.2em] text-text-gray mb-6">
                {t(`${service.key}.titleEn`)}
              </p>
              <p className="text-base leading-relaxed">
                {t(`${service.key}.description`)}
              </p>
              {service.hasCta && service.ctaUrl && (
                <a
                  href={service.ctaUrl}
                  {...EXTERNAL_LINK_PROPS}
                  className="inline-block mt-6 bg-accent text-deep-black px-8 py-3 text-xs font-bold uppercase tracking-widest hover:bg-accent/90 transition-colors"
                >
                  {t(`${service.key}.cta`)}
                </a>
              )}
            </motion.div>
          </div>
        </div>
      ))}
    </section>
  );
}
