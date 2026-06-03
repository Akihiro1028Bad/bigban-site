"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { EXTERNAL_LINK_PROPS } from "@/constants/site";
import InstagramIcon from "@/components/icons/InstagramIcon";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const INSTAGRAM_URL = "https://www.instagram.com/tac_monk/";

interface AchievementGroup {
  discipline: string;
  disciplineJa: string;
  note: string;
  items: string[];
}

export default function HyroxCoach() {
  const t = useTranslations("HyroxPage.coach");
  const achievements = t.raw("achievements") as AchievementGroup[];
  const career = t.raw("career") as string[];

  return (
    <section className="bg-deep-black py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="mb-12 text-center lg:mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl font-black tracking-[0.15em] text-text-light sm:text-5xl lg:text-6xl">
            {t("sectionTitle")}
          </h2>
          <p className="mt-3 text-xs tracking-[0.25em] text-text-gray sm:text-sm">
            {t("sectionTitleJa")}
          </p>
          <div className="mx-auto mt-4 h-[3px] w-14 bg-accent" />
        </motion.div>

        {/* 上段：写真＋プロフィール／経歴 */}
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
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
            <p className="mt-2 text-xs tracking-[0.2em] text-text-gray">
              {t("nameKana")}
            </p>
            <p className="mt-1 text-xs tracking-[0.3em] text-text-gray">
              {t("nameEn")}
            </p>
            <a
              href={INSTAGRAM_URL}
              {...EXTERNAL_LINK_PROPS}
              aria-label={t("instagramAria")}
              className="mt-3 inline-flex items-center gap-2 text-xs text-text-gray transition-colors hover:text-accent"
            >
              <InstagramIcon className="h-4 w-4 shrink-0" />
              <span className="tracking-normal">{t("instagram")}</span>
            </a>
            <div className="mt-5 h-[3px] w-14 bg-accent" />
            <p className="mt-5 text-base font-medium leading-relaxed text-text-light sm:text-lg">
              {t("intro")}
            </p>
            <p className="mt-3 text-xs tracking-[0.1em] text-text-gray">
              {t("profile")}
            </p>

            {/* 経歴 */}
            <div className="mt-8 border-t border-white/10 pt-6">
              <h4 className="text-[11px] uppercase tracking-[0.3em] text-text-gray">
                {t("careerTitle")}
                <span className="ml-2 normal-case tracking-normal text-text-gray/80">
                  {t("careerTitleJa")}
                </span>
              </h4>
              <ul className="mt-4 space-y-1.5">
                {career.map((item) => (
                  <li
                    key={item}
                    className="relative pl-4 text-sm leading-relaxed text-text-light/85 before:absolute before:left-0 before:top-[0.6em] before:h-1 before:w-1 before:bg-accent/70"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>

        {/* 下段：実績 全幅3カラム */}
        <motion.div
          className="mt-16 border-t border-white/10 pt-12 lg:mt-20"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h4 className="text-[11px] uppercase tracking-[0.3em] text-text-gray">
            {t("achievementsTitle")}
            <span className="ml-2 normal-case tracking-normal text-text-gray/80">
              {t("achievementsTitleJa")}
            </span>
          </h4>
          <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
            {achievements.map((group) => (
              <div key={group.discipline}>
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-base font-black tracking-wide text-accent sm:text-lg">
                    {group.discipline}
                  </span>
                  <span className="text-[11px] tracking-wide text-text-gray">
                    {group.disciplineJa}
                  </span>
                </div>
                {group.note ? (
                  <p className="mt-0.5 text-[11px] tracking-wide text-text-gray">
                    {group.note}
                  </p>
                ) : null}
                <ul className="mt-3 space-y-1.5">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="relative pl-4 text-sm leading-relaxed text-text-light/85 before:absolute before:left-0 before:top-[0.6em] before:h-1 before:w-1 before:bg-accent/70"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
