"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { EASE } from "@/constants/motion";
import { trackCtaClick } from "@/lib/analytics/trackEvent";
import HyroxSectionTitle from "./HyroxSectionTitle";
import HyroxStations from "./HyroxStations";


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
          <HyroxSectionTitle title={t("title")} titleJa={t("titleJa")} />
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
