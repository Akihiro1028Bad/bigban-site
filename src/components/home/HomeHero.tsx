"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { RESERVE_PATH } from "@/constants/site";
import { useMagneticButton } from "@/hooks/useMagneticButton";
import { EASE } from "@/constants/motion";
import { trackCtaClick } from "@/lib/analytics/trackEvent";


export default function HomeHero() {
  const t = useTranslations("HomeHero");
  const { ref, position, handleMouseMove, handleMouseLeave } =
    useMagneticButton();

  const headlineLines = [
    { text: t("headline1"), isAccent: false },
    { text: t("headline2"), isAccent: true },
    { text: t("headline3"), isAccent: false },
  ];

  return (
    <section className="relative bg-deep-black overflow-hidden pt-[calc(60px+var(--promo-banner-h))] md:pt-[calc(100px+var(--promo-banner-h))]">
      {/* Full-width 16:9 background image */}
      <div className="relative aspect-[16/9] min-h-[calc(100vh-100px)] w-full">
        <Image
          src="/images/hero.jpg"
          alt={t("heroImageAlt")}
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/50" />

        {/* Blue ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-[200px]"
            style={{ background: "rgba(48,110,195,0.1)" }}
          />
        </div>

        {/* Content overlay - left aligned */}
        <div className="absolute inset-0 z-10 flex items-center">
          <div className="px-8 md:px-16 lg:px-24 max-w-7xl">
            <h1 className="font-serif text-[clamp(2rem,5vw,5.5rem)] leading-[1.15]">
              {headlineLines.map((line, i) => (
                <span key={line.text} className="block overflow-hidden">
                  <motion.span
                    className={`block ${
                      line.isAccent
                        ? "text-accent font-black"
                        : "text-text-light"
                    }`}
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      duration: 0.8,
                      delay: 0.3 + i * 0.15,
                      ease: EASE,
                    }}
                  >
                    {line.text}
                  </motion.span>
                </span>
              ))}
            </h1>

            {/* English tagline */}
            <motion.p
              className="mt-4 text-sm tracking-[0.3em] text-text-gray md:text-base"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1.2, ease: EASE }}
            >
              {t("tagline")}
            </motion.p>

            {/* CTA */}
            <motion.div
              className="mt-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.5, ease: EASE }}
            >
              <Link
                ref={ref as React.RefObject<HTMLAnchorElement>}
                href={RESERVE_PATH}
                onClick={() => trackCtaClick("reserveEntry", "home_hero", t("cta"))}
                className="inline-block bg-accent px-8 py-3 text-sm font-bold tracking-widest text-deep-black transition-transform"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                  transform: `translate(${position.x}px, ${position.y}px)`,
                }}
              >
                {t("cta")}
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-8 z-20">
          <motion.span
            className="inline-block text-xs tracking-[0.2em] text-text-gray animate-bounce"
            style={{ writingMode: "vertical-rl" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 2, ease: EASE }}
          >
            {t("scroll")}
          </motion.span>
        </div>
      </div>
    </section>
  );
}
