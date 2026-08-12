"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { EASE } from "@/constants/motion";
import { COURT_PRICES } from "@/constants/pricing";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

// PBT CLUB 会員制度の告知ニュース記事 (microCMS slug: pbt-club-membership)。
const PBT_CLUB_NEWS_PATH = "/news/pbt-club-membership";

// コートレンタル料金テーブル（HomePricing / HyroxProgram 共用）。
interface CourtPriceTableProps {
  // 見出しラベル。未指定時は "COURT RENTAL"（HomePricing 用）。
  label?: string;
  // PBT CLUB 詳細リンクの計測 location（設置面ごとに切り分ける）。
  pbtClubLocation: string;
}

export default function CourtPriceTable({
  label,
  pbtClubLocation,
}: CourtPriceTableProps) {
  const t = useTranslations("HomePricing");
  const memberLabel = t("memberLabel");

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
      {/* 会員価格の行が増えて列幅が広がるため、狭い画面では左右パディングを詰める。 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-accent/20">
              <th className="text-center py-3 px-2 sm:px-4 text-text-light text-xs font-semibold tracking-[0.15em] bg-accent/[0.06]">
                {t("timeSlot")}
              </th>
              <th className="text-center py-3 px-2 sm:px-4 text-text-light text-xs font-semibold tracking-[0.15em] bg-accent/[0.06]">
                {t("weekday")}
              </th>
              <th className="text-center py-3 px-2 sm:px-4 text-text-light text-xs font-semibold tracking-[0.15em] bg-accent/[0.06]">
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
                <td className="py-5 px-2 sm:px-4 text-text-light text-sm font-medium text-center whitespace-nowrap">
                  {row.timeSlot}
                </td>
                <td className="py-5 px-2 sm:px-4 text-center">
                  <span className="text-xl font-bold text-text-light">
                    {row.weekday}
                  </span>
                  <span className="mt-1 block text-sm font-bold text-accent">
                    <span className="whitespace-nowrap">{memberLabel}</span>{" "}
                    <span className="whitespace-nowrap">
                      {row.weekdayMember}
                    </span>
                  </span>
                </td>
                <td className="py-5 px-2 sm:px-4 text-center">
                  <span className="text-xl font-bold text-text-light">
                    {row.weekend}
                  </span>
                  <span className="mt-1 block text-sm font-bold text-accent">
                    <span className="whitespace-nowrap">{memberLabel}</span>{" "}
                    <span className="whitespace-nowrap">
                      {row.weekendMember}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 会員価格の条件と詳細記事への導線（ホーム / HYROX 双方で同じ事実を出す） */}
      <p className="mt-4 text-text-gray text-xs leading-relaxed">
        {t("memberLegend")}{" "}
        <Link
          href={PBT_CLUB_NEWS_PATH}
          onClick={() =>
            trackCtaClick("contentClick", pbtClubLocation, "pbt-club")
          }
          className="text-accent hover:underline whitespace-nowrap"
        >
          {t("memberDetailLink")}
          <span aria-hidden="true"> →</span>
        </Link>
      </p>
    </motion.div>
  );
}
