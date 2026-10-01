"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

/** 問い合わせフォームを「貸切・法人」種別で開く(/about は searchParams.category を検証して使う)。 */
export const PRIVATE_CONTACT_HREF = "/about?category=private#contact";

export default function PrivateCta() {
  const t = useTranslations("Private.cta");

  return (
    <section className="mx-auto max-w-7xl px-6 pb-20 text-center lg:px-12 lg:pb-28">
      <h2 className="font-serif text-2xl font-bold text-text-light sm:text-3xl">
        {t("title")}
      </h2>
      <p className="mt-4 text-sm text-text-gray">{t("description")}</p>
      <Link
        href={PRIVATE_CONTACT_HREF}
        onClick={() => trackCtaClick("contentClick", "private_cta", "contact")}
        className="mt-8 inline-block bg-accent px-8 py-3 text-sm font-semibold tracking-[0.15em] text-deep-black transition-colors hover:bg-accent/90"
      >
        {t("button")}
      </Link>
    </section>
  );
}
