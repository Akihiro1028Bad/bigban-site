"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { EXTERNAL_LINK_PROPS } from "@/constants/site";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const INSTAGRAM_URL = "https://www.instagram.com/syugyou_sou/";

export default function HyroxCoach() {
  const t = useTranslations("HyroxPage.coach");
  const titles = t.raw("titles") as string[];
  const stats = [
    { label: t("stats.pbLabel"), value: t("stats.pbValue") },
    { label: t("stats.racesLabel"), value: t("stats.racesValue") },
    { label: t("stats.apacLabel"), value: t("stats.apacValue") },
    { label: t("stats.signatureLabel"), value: t("stats.signatureValue") },
  ];

  return (
    <section className="bg-deep-black py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="mb-12 lg:mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.15em] text-text-light">
            {t("sectionTitle")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("sectionTitleJa")}
          </p>
          <div className="mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden border border-accent/20 border-t-2 border-t-accent">
            <Image
              src="/images/hyrox/coach-portrait.jpg"
              alt={t("portraitAlt")}
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="absolute -bottom-5 -right-3 hidden aspect-[4/3] w-32 overflow-hidden border border-accent/30 sm:block lg:w-40">
            <Image
              src="/images/hyrox/coach-apac.jpg"
              alt={t("apacAlt")}
              fill
              sizes="160px"
              className="object-cover"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, delay: 0.1, ease: EASE }}
        >
          <h3 className="font-serif text-4xl font-black tracking-[0.08em] text-text-light sm:text-5xl">
            {t("name")}
          </h3>
          <p className="mt-2 text-xs tracking-[0.3em] text-text-gray">
            {t("nameEn")}
          </p>
          <p className="mt-1 text-xs tracking-[0.2em] text-accent/80">
            {t("role")}
          </p>
          <div className="mt-5 h-[3px] w-14 bg-accent" />

          <ul className="mt-6 space-y-2">
            {titles.map((title) => (
              <li
                key={title}
                className="relative pl-5 text-sm leading-relaxed text-text-light/85 before:absolute before:left-0 before:top-[0.55em] before:h-1.5 before:w-1.5 before:bg-accent"
              >
                {title}
              </li>
            ))}
          </ul>

          <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-6 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-[10px] tracking-[0.2em] text-text-gray">
                  {s.label}
                </dt>
                <dd className="mt-1 font-serif text-lg text-accent sm:text-xl">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-sm leading-relaxed text-text-light/75">
            {t("bio")}
          </p>

          <a
            href={INSTAGRAM_URL}
            {...EXTERNAL_LINK_PROPS}
            aria-label={t("instagramAria")}
            className="mt-6 inline-flex items-center gap-2 text-xs tracking-[0.2em] text-accent transition-colors hover:text-accent/80"
          >
            Instagram {t("instagram")}
          </a>
        </motion.div>
        </div>
      </div>
    </section>
  );
}
