"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { EASE } from "@/constants/motion";
import { trackCtaClick } from "@/lib/analytics/trackEvent";


export default function HomeAbout() {
  const t = useTranslations("HomeAbout");

  return (
    <section
      id="about"
      className="relative py-16 lg:py-24 overflow-hidden"
      style={{
        background: "linear-gradient(to bottom, #0d0d1a, #0A0A0A)",
      }}
    >
      {/* Background image */}
      <Image
        src="/images/home-nishimura.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/65" />

      {/* Blue ambient glow */}
      <div
        className="absolute top-[10%] right-[10%] w-[400px] h-[400px] rounded-full blur-[150px] pointer-events-none"
        style={{ background: "rgba(48,110,195,0.12)" }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-12">
        {/* Section Title */}
        <motion.div
          className="text-center mb-12 lg:mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-black tracking-[0.15em] text-text-light">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        {/* Photo + Text layout */}
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
          {/* Left: Photo */}
          <motion.div
            className="lg:w-[40%] shrink-0"
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.1, ease: EASE }}
          >
            <div className="relative aspect-[4/3] w-full max-w-sm mx-auto lg:mx-0 overflow-hidden rounded-sm">
              <Image
                src="/images/home-nishimura.jpg"
                alt={t("founderImageAlt")}
                fill
                sizes="(min-width: 1024px) 40vw, (min-width: 640px) 24rem, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>
          </motion.div>

          {/* Right: Text */}
          <motion.div
            className="flex-1 flex flex-col justify-center"
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.1, delay: 0.15, ease: EASE }}
          >
            <span className="text-[10px] tracking-[0.25em] text-accent block mb-4">
              {t("founderLabel")}
            </span>
            <h3 className="font-serif text-4xl lg:text-5xl text-text-light mb-2">
              {t("founderName")}
            </h3>
            <p className="text-sm tracking-[0.15em] text-text-gray mb-4">
              {t("founderNameEn")}
            </p>

            <a
              href={`https://www.instagram.com/${t("founderInstagram").replace(/^@/, "")}/`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackCtaClick("instagram", "home_about")}
              className="inline-flex items-center gap-1.5 text-text-light/90 text-sm mb-8 hover:text-accent transition-colors"
            >
              <InstagramIcon className="w-4 h-4" />
              <span>{t("founderInstagram")}</span>
            </a>

            <p className="text-text-light/90 text-base lg:text-lg leading-relaxed mb-4">
              {t("founderBio1")}
            </p>
            <p className="text-text-light/90 text-sm lg:text-base leading-relaxed mb-10">
              {t("founderBio2")}
            </p>

            <Link
              href="/about"
              onClick={() => trackCtaClick("contentClick", "home_about_read_more", "about")}
              className="inline-flex items-center gap-2 text-accent text-sm tracking-[0.15em] hover:gap-3 transition-all duration-300"
            >
              {t("readMore")}
              <span className="text-lg">&rarr;</span>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
