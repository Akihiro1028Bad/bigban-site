"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { EASE } from "@/constants/motion";
import { COURT_PRICES } from "@/constants/pricing";

// コートレンタル料金テーブル（HomePricing / HyroxProgram 共用）。
interface CourtPriceTableProps {
  // 見出しラベル。未指定時は "COURT RENTAL"（HomePricing 用）。
  label?: string;
}

export default function CourtPriceTable({ label }: CourtPriceTableProps) {
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
        {label ?? t("courtRental")}
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
