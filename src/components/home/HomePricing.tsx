"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";

interface PriceRow {
  timeSlot: string;
  weekday: string;
  weekend: string;
}

const COURT_PRICES: PriceRow[] = [
  { timeSlot: "6:00-9:00", weekday: "¥4,980", weekend: "¥7,980" },
  { timeSlot: "9:00-17:00", weekday: "¥5,980", weekend: "¥7,980" },
  { timeSlot: "17:00-23:00", weekday: "¥7,980", weekend: "¥7,980" },
];

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

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
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, delay: 0.1, ease: EASE }}
        >
          <p className="text-[10px] tracking-[0.25em] text-accent mb-4">
            {t("courtRental")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-accent/20">
                  <th className="text-center py-3 px-4 text-text-light text-xs font-semibold tracking-[0.15em] bg-accent/[0.06]">
                    {t("timeSlot")}
                  </th>
                  <th className="text-center py-3 px-4 text-text-light text-xs font-semibold tracking-[0.15em] bg-accent/[0.06]">
                    {t("weekday")}
                  </th>
                  <th className="text-center py-3 px-4 text-text-light text-xs font-semibold tracking-[0.15em] bg-accent/[0.06]">
                    {t("weekend")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {COURT_PRICES.map((row, i) => (
                  <tr
                    key={row.timeSlot}
                    className={`border-b border-white/[0.04] ${
                      i % 2 === 1 ? "bg-white/[0.02]" : ""
                    }`}
                  >
                    <td className="py-5 px-4 text-text-light text-sm font-medium text-center">
                      {row.timeSlot}
                    </td>
                    <td className="py-5 px-4 text-center">
                      <span className="text-xl font-bold text-text-light">
                        {row.weekday}
                      </span>
                    </td>
                    <td className="py-5 px-4 text-center">
                      <span className="text-xl font-bold text-text-light">
                        {row.weekend}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

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
            <span className="text-accent/50 text-xs tracking-wider">
              {t("preparing")}
            </span>
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
