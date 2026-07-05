"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { EASE } from "@/constants/motion";
import { isHyroxCampaignActive } from "@/lib/promoSchedule";

interface HyroxCampaignProps {
  // banner: HYROXページ上部の帯 / note: 料金・予約セクション内の告知カード。
  variant?: "banner" | "note";
}

// オープン記念＆千葉大会応援キャンペーンの告知。
// 期間外（8/9 経過後）は promoSchedule により自動的に非表示になる。
export default function HyroxCampaign({ variant = "banner" }: HyroxCampaignProps) {
  const t = useTranslations("HyroxCampaign");

  if (!isHyroxCampaignActive()) return null;

  if (variant === "note") {
    return (
      <motion.div
        className="mx-auto mb-6 max-w-md rounded-sm border border-accent/40 bg-accent/[0.08] px-5 py-4 text-center"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 1.0, ease: EASE }}
      >
        <p className="text-[11px] font-bold tracking-[0.2em] text-accent">
          🎉 {t("title")}
        </p>
        <p className="mt-1 text-sm font-bold text-text-light">{t("period")}</p>
        <p className="mt-1 text-xs text-text-gray">{t("priceNote")}</p>
      </motion.div>
    );
  }

  return (
    <motion.aside
      aria-label={t("title")}
      className="bg-accent text-deep-black"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-0.5 px-6 py-3 text-center sm:flex-row sm:justify-center sm:gap-4 lg:px-12">
        <span className="text-sm font-black tracking-wide">
          🎉 {t("title")}
        </span>
        <span className="text-xs font-bold sm:text-sm">{t("period")}</span>
      </div>
    </motion.aside>
  );
}
