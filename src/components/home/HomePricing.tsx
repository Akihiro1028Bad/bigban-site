"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import CourtPriceTable from "@/components/pricing/CourtPriceTable";
import { trackCtaClick } from "@/lib/analytics/trackEvent";
import { EASE } from "@/constants/motion";


export default function HomePricing() {
  const t = useTranslations("HomePricing");

  return (
    <section
      id="pricing"
      className="bg-deep-black pt-8 lg:pt-16 pb-16 lg:pb-32 text-text-light"
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
        <CourtPriceTable />

        {/* Training Area & Membership */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
          <motion.div
            className="border border-text-gray/15 rounded-sm px-5 py-4 flex items-center justify-between"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.0, delay: 0.2, ease: EASE }}
          >
            <div>
              <span className="text-[10px] tracking-[0.25em] text-accent block mb-1">
                {t("trainingArea")}
              </span>
              <span className="text-text-light text-sm">
                {t("trainingAreaJa")}
              </span>
            </div>
            <div className="text-right">
              <span className="block font-serif text-lg font-bold tracking-wider text-accent">
                {t("trainingAreaPrice")}
              </span>
              <span className="text-[10px] tracking-wider text-text-gray">
                {t("trainingAreaUnit")}
              </span>
            </div>
          </motion.div>

          <motion.div
            className="border border-text-gray/15 rounded-sm px-5 py-4 flex items-center justify-between"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.0, delay: 0.25, ease: EASE }}
          >
            <div>
              <span className="text-[10px] tracking-[0.25em] text-accent block mb-1">
                {t("membership")}
              </span>
              <span className="text-text-light text-sm">{t("membershipJa")}</span>
            </div>
            <span className="text-accent/50 text-xs tracking-wider">
              {t("comingSoon")}
            </span>
          </motion.div>
        </div>

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
      </div>
    </section>
  );
}
