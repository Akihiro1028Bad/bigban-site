"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import HyroxStations from "./HyroxStations";
import { EASE } from "@/constants/motion";
import { trackCtaClick } from "@/lib/analytics/trackEvent";


interface HyroxIntroProps {
  /** コラム CMS(USE_CMS_COLUMNS)有効時のみ入門コラムへの内部リンクを出す */
  showColumnLink?: boolean;
}

export default function HyroxIntro({ showColumnLink = false }: HyroxIntroProps) {
  const t = useTranslations("HyroxPage.whatIs");

  return (
    <section className="bg-deep-black py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.15em] text-text-light">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
          <p className="mt-8 mx-auto text-text-gray text-sm lg:text-base leading-loose max-w-2xl">
            {t("lead")}
          </p>
          {showColumnLink && (
            <p className="mt-6">
              <Link
                href="/columns/hyrox-beginners-guide"
                onClick={() =>
                  trackCtaClick("contentClick", "hyrox_what_is", "column_beginners_guide")
                }
                className="inline-block text-sm text-accent underline underline-offset-4 transition-colors hover:text-accent/80"
              >
                {t("columnLink")}
              </Link>
            </p>
          )}
        </motion.div>

        <HyroxStations />
      </div>
    </section>
  );
}
