"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics/trackEvent";
import { EXTERNAL_LINK_PROPS, INSTAGRAM_URL } from "@/constants/site";

// 英語話者向けの補足案内。LaBOLA・テニスベアの画面が日本語のみであること、支払い・
// キャンセル、テニスベア、問い合わせ先を伝える。予約の手順は ReserveVisitorGuide が担う。
// /en/reserve だけに表示する。
export default function ReserveEnglishGuide() {
  const t = useTranslations("Reserve.englishGuide");

  return (
    <section
      aria-labelledby="reserve-english-guide-heading"
      className="bg-deep-black pb-16 lg:pb-24"
    >
      <div className="mx-auto max-w-3xl px-6 lg:px-12">
        <h2
          id="reserve-english-guide-heading"
          className="mb-4 text-xs tracking-[0.3em] text-accent"
        >
          {t("heading")}
        </h2>
        <p className="text-sm leading-relaxed text-text-light/80">{t("notice")}</p>

        <h3 className="mt-8 text-base font-bold text-text-light">
          {t("paymentHeading")}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-gray">
          {t("paymentBody")}
        </p>

        <h3 className="mt-8 text-base font-bold text-text-light">
          {t("tennisbearHeading")}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-gray">
          {t("tennisbearBody")}
        </p>

        <h3 className="mt-8 text-base font-bold text-text-light">
          {t("helpHeading")}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-text-gray">
          {t("helpBody")}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link
            href="/about#contact"
            className="text-accent underline underline-offset-4 hover:text-accent/80"
          >
            {t("contactCta")}
          </Link>
          <a
            href={INSTAGRAM_URL}
            {...EXTERNAL_LINK_PROPS}
            onClick={() => trackCtaClick("instagram", "reserve_english_guide", "dm")}
            className="text-accent underline underline-offset-4 hover:text-accent/80"
          >
            {t("instagramCta")}
          </a>
        </p>
      </div>
    </section>
  );
}
