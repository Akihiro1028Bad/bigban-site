"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics/trackEvent";
import { EXTERNAL_LINK_PROPS, INSTAGRAM_URL } from "@/constants/site";

interface GuideStep {
  title: string;
  body: string;
}

function isGuideStep(value: unknown): value is GuideStep {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.title === "string" && typeof record.body === "string";
}

// 英語話者向けの案内。LaBOLA・テニスベアの画面は日本語のみなので、押す場所を日本語の
// ボタン名つきで説明する。/en/reserve だけに表示する。
export default function ReserveEnglishGuide() {
  const t = useTranslations("Reserve.englishGuide");
  // t.raw は unknown を返すため、システム境界として配列と各要素の形を検証する。
  const rawSteps = t.raw("steps");
  const steps = Array.isArray(rawSteps) ? rawSteps.filter(isGuideStep) : [];

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
          {t("labolaHeading")}
        </h3>
        <ol className="mt-4 space-y-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden
                className="pt-0.5 font-serif text-lg leading-none text-accent"
              >
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-bold text-text-light">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-gray">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

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
