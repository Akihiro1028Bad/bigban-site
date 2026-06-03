"use client";

import { useTranslations } from "next-intl";
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

// コートレンタル料金テーブル（HomePricing / HyroxProgram 共用）。
export default function CourtPriceTable() {
  const t = useTranslations("HomePricing");

  return (
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
  );
}
