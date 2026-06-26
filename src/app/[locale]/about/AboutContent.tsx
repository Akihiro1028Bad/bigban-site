"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import PlayerCarousel from "@/components/about/PlayerCarousel";
import PlayerCard, { type Player } from "@/components/about/PlayerCard";
import CrewCard from "@/components/about/CrewCard";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { CAMPFIRE_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";
import { NEWS_CATEGORIES } from "@/constants/news";

import type { FormEvent } from "react";
import type { NewsItem } from "@/lib/microcms/schema";
import { EASE } from "@/constants/motion";


// a5 (Vol.3 優勝) を a4 (Vol.1 準優勝) より先に表示するため意図的に逆順
const ACHIEVEMENT_KEYS = ["a1", "a2", "a3", "a5", "a4", "a6", "a7", "a8"] as const;

type AchievementType = "gold" | "silver" | "rep" | "other";

const ACHIEVEMENT_TYPES: Record<(typeof ACHIEVEMENT_KEYS)[number], AchievementType> = {
  a1: "rep",
  a2: "other",
  a3: "gold",
  a4: "silver",
  a5: "gold",
  a6: "silver",
  a7: "gold",
  a8: "gold",
};

interface ContactCategory {
  value: string;
  label: string;
}

function useCategories(): ContactCategory[] {
  const t = useTranslations("About");
  return [
    { value: "", label: t("contact.categoryDefault") },
    { value: "court", label: t("contact.categoryCourt") },
    { value: "lesson", label: t("contact.categoryLesson") },
    { value: "press", label: t("contact.categoryPress") },
    { value: "other", label: t("contact.categoryOther") },
  ];
}

interface SectionHeaderProps {
  number: string;
  labelEn: string;
  id: string;
}

function SectionHeader({ number, labelEn, id }: SectionHeaderProps) {
  return (
    <motion.div
      id={id}
      className="mb-12 scroll-mt-24"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <span className="text-accent/40 font-serif text-sm tracking-wider">
        {number}
      </span>
      <span className="text-text-gray text-sm tracking-wider ml-3">—</span>
      <span className="text-accent text-sm tracking-[0.2em] ml-3">
        {labelEn}
      </span>
    </motion.div>
  );
}

interface AboutContentProps {
  newsItems?: NewsItem[];
  locale?: "ja" | "en";
}

/* istanbul ignore next -- @preserve デフォルト引数は呼び出し側で常に props を渡すため到達不可 */
export default function AboutContent({
  newsItems = [],
  locale = "ja",
}: AboutContentProps = {}) {
  const t = useTranslations("About");
  const categories = useCategories();
  // Server で flag OFF 時は newsItems が必ず空配列で渡される (page.tsx 参照)。
  // Client では env が読めず Hydration mismatch を起こすため、
  // newsItems の有無のみで CMS 表示を判定する。
  const useCms = newsItems.length > 0;

  const players = useMemo<Player[]>(
    () => [
      {
        name: t("players.playerName"),
        ig: t("players.playerIg"),
        bio: t("players.playerBio"),
        image: "/images/yuta-yoshida.jpg",
        imageAlt: t("players.playerName"),
      },
      {
        name: t("players.comingSoon"),
        ig: "",
        bio: "",
      },
    ],
    [t]
  );

  useEffect(() => {
    if (!window.location.hash) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, []);

  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");

    const formData = new FormData(e.currentTarget);
    const body = Object.fromEntries(formData.entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  const inputClass =
    "w-full border-b border-text-gray/40 bg-transparent py-3 text-text-light placeholder:text-text-gray/60 focus:border-accent focus:outline-none transition-colors";

  return (
    <main className="bg-deep-black min-h-screen">
      <HomeNavigation />

      {/* Hero */}
      <section className="pt-[calc(7rem+var(--promo-banner-h))] pb-12 lg:pt-[calc(8rem+var(--promo-banner-h))] lg:pb-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <h1 className="font-serif text-5xl sm:text-7xl lg:text-8xl font-black tracking-[0.08em] sm:tracking-[0.15em] text-text-light">
              {t("hero.title")}
            </h1>
            <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
          </motion.div>
        </div>
      </section>

      {/* 01 -- COMPANY */}
      <section className="py-12 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <SectionHeader number="01" labelEn="COMPANY" id="company" />

          <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
            <motion.div
              className="flex-1"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <h2 className="text-text-light text-2xl lg:text-3xl font-bold mb-6">
                {t("company.name")}
              </h2>
              <p className="text-text-light/90 text-base lg:text-lg leading-relaxed mb-4">
                {t("company.description1")}
              </p>
              <p className="text-text-light/90 text-sm lg:text-base leading-relaxed">
                {t("company.description2")}
              </p>
            </motion.div>

            <motion.div
              className="lg:w-[35%] shrink-0"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            >
              <div className="bg-gradient-to-b from-accent/[0.07] to-transparent px-8 py-10 relative">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-text-gray">{t("company.labelCompanyName")}</dt>
                    <dd className="text-text-light mt-1">{t("company.name")}</dd>
                  </div>
                  <div>
                    <dt className="text-text-gray">{t("company.labelCeo")}</dt>
                    <dd className="text-text-light mt-1">{t("company.valueCeo")}</dd>
                  </div>
                  <div>
                    <dt className="text-text-gray">{t("company.labelBusiness")}</dt>
                    <dd className="text-text-light mt-1">{t("company.valueBusiness")}</dd>
                  </div>
                  <div>
                    <dt className="text-text-gray">{t("company.labelAddress")}</dt>
                    <dd className="text-text-light mt-1 whitespace-pre-line">{t("company.valueAddress")}</dd>
                  </div>
                </dl>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 02 -- FOUNDER */}
      <section className="py-12 lg:py-16 border-t border-text-gray/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <SectionHeader number="02" labelEn="FOUNDER" id="founder" />

          {/* Name - full width top */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <div className="flex items-baseline gap-4 flex-wrap">
              <h2 className="font-serif text-5xl lg:text-6xl text-text-light">
                {t("founder.name")}
              </h2>
              <p className="text-sm tracking-[0.15em] text-text-gray">
                {t("founder.nameEn")}
              </p>
            </div>
            <a
              href={`https://www.instagram.com/${t("founder.instagram").replace(/^@/, "")}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-text-light/90 text-sm hover:text-accent transition-colors"
            >
              <InstagramIcon className="w-4 h-4" />
              <span>{t("founder.instagram")}</span>
            </a>
          </motion.div>

          {/* Photo left + Text right */}
          <div className="flex flex-col sm:flex-row gap-8 lg:gap-12">
            <motion.div
              className="w-[40%] sm:w-[25%] shrink-0"
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm">
                <Image
                  src="/images/about-nishimura.jpg"
                  alt={t("founder.imageAlt")}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              </div>
            </motion.div>

            <motion.div
              className="flex-1"
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            >
              <p className="text-text-light/90 text-base lg:text-lg leading-loose mb-4">
                {t("founder.bio1")}
              </p>
              <p className="text-text-light/90 text-base lg:text-lg leading-loose mb-4">
                {t("founder.bio2")}
              </p>
              <p className="text-text-light/90 text-base lg:text-lg leading-loose mb-4">
                {t("founder.bio3")}
              </p>
              <p className="text-text-light/90 text-base lg:text-lg leading-loose">
                {t("founder.bio4")}
              </p>
            </motion.div>
          </div>

          {/* Achievements — MEDAL SHOWCASE */}
          <motion.div
            className="mt-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <h3 className="text-xs tracking-[0.3em] text-text-gray font-bold mb-10">
              PICKLEBALL CAREER
            </h3>

            {/* Table */}
            <div className="overflow-x-auto">
              <div className="hidden sm:grid grid-cols-[70px_1fr_1fr_120px] gap-4 border-b border-accent/30 pb-2 mb-2">
                <span className="text-[10px] tracking-[0.3em] text-text-gray">YEAR</span>
                <span className="text-[10px] tracking-[0.3em] text-text-gray">TOURNAMENT</span>
                <span className="text-[10px] tracking-[0.3em] text-text-gray">CATEGORY</span>
                <span className="text-[10px] tracking-[0.3em] text-text-gray text-right">RESULT</span>
              </div>
              {ACHIEVEMENT_KEYS.map((key) => ({
                key,
                year: t(`founder.achievements.${key}.year`),
                tournament: t(`founder.achievements.${key}.tournament`),
                event: t(`founder.achievements.${key}.event`),
                result: t(`founder.achievements.${key}.result`),
                type: ACHIEVEMENT_TYPES[key],
              })).map((row, i) => (
                <motion.div
                  key={row.key}
                  className="grid grid-cols-1 sm:grid-cols-[70px_1fr_1fr_120px] gap-1 sm:gap-4 border-b border-white/[0.05] py-3 hover:bg-white/[0.02] transition-colors"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
                >
                  <span className="text-accent text-sm font-bold">{row.year}</span>
                  <span className="text-text-light text-sm">{row.tournament}</span>
                  <span className="text-text-gray text-sm">{row.event}</span>
                  <span className={`text-sm sm:text-right ${
                    row.type === "gold" || row.type === "silver" ? "text-accent font-bold" :
                    "text-text-gray"
                  }`}>
                    {row.result}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* 03 -- OUR PLAYERS */}
      <section className="py-12 lg:py-16 border-t border-text-gray/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <SectionHeader number="03" labelEn="OUR PLAYERS" id="players" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <h2 className="text-text-light text-2xl lg:text-3xl font-bold mb-6">
              {t("players.title")}
            </h2>
            <p className="text-text-light/90 text-sm lg:text-base leading-relaxed mb-12">
              {t("players.description")}
            </p>

            <div className="md:hidden @container">
              <PlayerCarousel players={players} />
            </div>

            <div className="hidden md:grid md:grid-cols-2 gap-8 @container">
              {players.map((player, i) => (
                <PlayerCard key={i} player={player} />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* 04 -- OUR CREW */}
      <section className="py-12 lg:py-16 border-t border-text-gray/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <SectionHeader number="04" labelEn="OUR CREW" id="crew" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <h2 className="text-text-light text-2xl lg:text-3xl font-bold mb-6">
              {t("crew.title")}
            </h2>
            <p className="text-text-light/90 text-sm lg:text-base leading-relaxed mb-12 max-w-2xl">
              {t("crew.description")}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
              {[
                {
                  name: t("crew.yasuko.name"),
                  ig: t("crew.yasuko.ig"),
                  image: "/images/crew-yasuko.jpg",
                },
                {
                  name: t("crew.misuzu.name"),
                  ig: t("crew.misuzu.ig"),
                  image: "/images/crew-misuzu.jpg",
                },
                {
                  name: t("crew.akihiro.name"),
                  ig: t("crew.akihiro.ig"),
                  image: "/images/crew-akihiro.jpg",
                  imagePosition: "object-[35%_20%]",
                },
              ].map((member, i) => (
                <motion.div
                  key={member.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1, ease: EASE }}
                >
                  <CrewCard member={member} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* 05 -- NEWS */}
      <section className="py-12 lg:py-16 border-t border-text-gray/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <SectionHeader number="05" labelEn="NEWS" id="news" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <h2 className="text-text-light text-2xl lg:text-3xl font-bold mb-8">
              {t("news.title")}
            </h2>

            <div className="space-y-10">
              {/* istanbul ignore next -- @preserve CMS 経路は e2e (USE_CMS_NEWS=true) で検証 */}
              {useCms ? (
                <>
                  {newsItems.map((item) => {
                    const href =
                      locale === "ja"
                        ? `/news/${item.slug}`
                        : `/en/news/${item.slug}`;
                    const cat = NEWS_CATEGORIES.find(
                      (c) => c.id === item.category[0],
                    );
                    return (
                      <Link
                        key={item.id}
                        href={href}
                        className="group block border-l-2 border-accent/20 pl-6 lg:pl-8 motion-safe:transition-colors hover:border-accent"
                      >
                        <div className="flex flex-col md:flex-row md:items-start md:gap-6">
                          <div className="relative w-full md:w-48 lg:w-56 shrink-0 aspect-[16/9] bg-deep-black overflow-hidden mb-4 md:mb-0">
                            {item.eyecatch ? (
                              <Image
                                src={`${item.eyecatch.url}?w=480&fm=webp&q=75`}
                                alt=""
                                width={480}
                                height={Math.round(
                                  (item.eyecatch.height /
                                    item.eyecatch.width) *
                                    480,
                                )}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                data-testid="about-news-placeholder"
                                className="w-full h-full"
                                style={{
                                  background: `linear-gradient(135deg, ${cat?.color ?? "#8A8A8A"}33 0%, #0A0A0A 100%)`,
                                }}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-accent text-lg lg:text-xl font-bold mb-3">
                              {item.title}
                            </h3>
                            <p className="text-text-light/90 text-base lg:text-lg leading-relaxed mb-4 max-w-3xl">
                              {item.excerpt}
                            </p>
                            <span className="inline-flex items-center gap-2 text-accent text-sm tracking-wide">
                              {locale === "ja" ? "続きを読む" : "Read more"}
                              <span className="inline-block text-lg motion-safe:transition-transform motion-safe:duration-300 group-hover:translate-x-1">
                                →
                              </span>
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                  <Link
                    href={locale === "ja" ? "/news" : "/en/news"}
                    className="inline-flex items-center gap-2 text-text-light text-sm tracking-wide"
                  >
                    {locale === "ja" ? "すべてのニュースを見る" : "View all news"}
                    <span>→</span>
                  </Link>
                </>
              ) : (
                <>
                  <div className="border-l-2 border-accent/20 pl-6 lg:pl-8">
                    <h3 className="text-accent text-lg lg:text-xl font-bold mb-3">
                      {t("news.crowdfundingHeadline")}
                    </h3>
                    <p className="text-text-light/90 text-base lg:text-lg leading-relaxed mb-4 max-w-3xl">
                      {t("news.crowdfundingBody")}
                    </p>
                    <a
                      href={CAMPFIRE_URL}
                      {...EXTERNAL_LINK_PROPS}
                      className="group inline-flex items-center gap-2 text-accent text-sm tracking-wide"
                    >
                      {t("news.crowdfundingLink")}{" "}
                      <span className="inline-block text-lg motion-safe:transition-transform motion-safe:duration-300 group-hover:translate-x-1">
                        →
                      </span>
                    </a>
                  </div>

                  <div className="border-l-2 border-accent/20 pl-6 lg:pl-8">
                    <p className="text-text-light/90 text-base lg:text-lg leading-relaxed mb-4 max-w-3xl">
                      {t("news.body")}
                    </p>
                    <a
                      href="https://prtimes.jp/main/html/rd/p/000000003.000179043.html"
                      {...EXTERNAL_LINK_PROPS}
                      className="group inline-flex items-center gap-2 text-accent text-sm tracking-wide"
                    >
                      {t("news.prTimes")}{" "}
                      <span className="inline-block text-lg motion-safe:transition-transform motion-safe:duration-300 group-hover:translate-x-1">
                        →
                      </span>
                    </a>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* 06 -- CONTACT */}
      <section className="py-12 lg:py-16 border-t border-text-gray/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <SectionHeader number="06" labelEn="CONTACT" id="contact" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
            {/* Info */}
            <motion.div
              className="order-first lg:order-last"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <p className="text-xs tracking-[0.3em] text-text-gray uppercase mb-8">
                {t("contact.getInTouch")}
              </p>
              <div className="space-y-6">
                <div>
                  <p className="text-sm text-text-gray mb-1">{t("contact.instagram")}</p>
                  <a
                    href="https://www.instagram.com/thepicklebangtheory"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg text-text-light hover:text-accent transition-colors"
                  >
                    @thepicklebangtheory
                  </a>
                </div>
                <div>
                  <p className="text-sm text-text-gray mb-1">{t("contact.address")}</p>
                  <p className="text-lg text-text-light">{t("contact.addressValue")}</p>
                </div>
                <div>
                  <p className="text-sm text-text-gray mb-1">{t("contact.hours")}</p>
                  <p className="text-lg text-text-light">{t("contact.hoursValue")}</p>
                </div>
              </div>
            </motion.div>

            {/* Form */}
            <motion.div
              className="order-last lg:order-first"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            >
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="about-contact-name" className="sr-only">{t("contact.labelName")}</label>
                  <input id="about-contact-name" name="name" type="text" required placeholder={t("contact.placeholderName")} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="about-contact-email" className="sr-only">{t("contact.labelEmail")}</label>
                  <input id="about-contact-email" name="email" type="email" required placeholder={t("contact.placeholderEmail")} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="about-contact-category" className="sr-only">{t("contact.labelCategory")}</label>
                  <select id="about-contact-category" name="category" required className={`${inputClass} cursor-pointer`} defaultValue="">
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value} disabled={cat.value === ""}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="about-contact-message" className="sr-only">{t("contact.labelMessage")}</label>
                  <textarea id="about-contact-message" name="message" required placeholder={t("contact.placeholderMessage")} rows={5} className={`${inputClass} resize-none`} />
                </div>
                <button type="submit" disabled={status === "sending"} className="bg-accent text-deep-black px-8 py-3 text-sm font-semibold tracking-[0.15em] uppercase hover:bg-accent/90 transition-colors disabled:opacity-50">
                  {t("contact.sendMessage")}
                </button>
                {status === "success" && <p className="text-accent mt-4">{t("contact.successMessage")}</p>}
                {status === "error" && <p className="text-red-400 mt-4">{t("contact.errorMessage")}</p>}
              </form>
            </motion.div>
          </div>
        </div>
      </section>

      <HomeFooter />
    </main>
  );
}
