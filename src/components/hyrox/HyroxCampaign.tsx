"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { EASE } from "@/constants/motion";
import { isHyroxCampaignActive } from "@/lib/promoSchedule";

// オープン記念＆千葉大会応援キャンペーンの告知カード。
// 料金セクション・予約セクションに差し込む。期間外（8/9 経過後）は
// promoSchedule により自動的に非表示になる。
export default function HyroxCampaign() {
  const t = useTranslations("HyroxCampaign");

  if (!isHyroxCampaignActive()) return null;

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
