"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import CourtPriceTable from "@/components/pricing/CourtPriceTable";
import { EASE } from "@/constants/motion";
import { RESERVE_PATH } from "@/constants/site";
import { trackCtaClick } from "@/lib/analytics/trackEvent";


export default function HomePricing() {
  const t = useTranslations("HomePricing");

  return (
    <section
      id="pricing"
      className="bg-deep-black pt-8 lg:pt-16 pb-16 lg:pb-24 text-text-light"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* Section Title */}
        <motion.div
          className="text-center mb-12 lg:mb-16"
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

        {/* 料金ラベル */}
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          <p className="text-text-light text-sm mb-2">
            {t("perHour")}
          </p>
          <div className="mx-auto mt-4 w-10 h-px bg-accent/30" />
        </motion.div>

        {/* Court Rental Table */}
        <CourtPriceTable pbtClubLocation="home_pricing_pbt_club" />

        {/* Footer notes */}
        <motion.div
          className="border-t border-text-gray/10 pt-8 space-y-3"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.0, delay: 0.3, ease: EASE }}
        >
          <div className="flex items-start gap-3">
            <span className="text-accent text-xs mt-0.5">▸</span>
            <p className="text-text-gray text-sm">
              {t("rentalPaddleNote")}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-accent text-xs mt-0.5">▸</span>
            <p className="text-text-gray text-sm">
              {t("hyroxRateNote")}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-accent text-xs mt-0.5">▸</span>
            <p className="text-text-gray text-sm">
              {t("privateFacilityNote")}
              <Link
                href="/about#contact"
                onClick={() => trackCtaClick("price", "home_pricing")}
                className="text-accent hover:underline"
              >
                {t("contactUs")}
              </Link>
              {t("pleaseContact")}
            </p>
          </div>
        </motion.div>

        {/* 料金を確認した直後に予約へ進めるようにする主要導線 */}
        <motion.div
          className="mt-10 text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.0, delay: 0.4, ease: EASE }}
        >
          <Link
            href={RESERVE_PATH}
            onClick={() =>
              trackCtaClick("reserveEntry", "home_pricing_reserve", t("reserveCta"))
            }
            className="inline-block bg-accent text-deep-black px-8 py-3 text-sm font-bold tracking-widest hover:bg-accent/90 transition-colors"
          >
            {t("reserveCta")}
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
