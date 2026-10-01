import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import StructuredData from "@/components/StructuredData";
import HomeFooter from "@/components/home/HomeFooter";
import HomeNavigation from "@/components/home/HomeNavigation";
import PrivateCta from "@/components/private/PrivateCta";
import PrivateDetails from "@/components/private/PrivateDetails";
import PrivateHero from "@/components/private/PrivateHero";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { SITE_URL } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import { businessHoursDisplayFor } from "@/lib/businessHoursDisplay";
import { buildPageOpenGraph } from "@/lib/metadata/pageOpenGraph";
import { buildBreadcrumb } from "@/lib/structured-data";

import type { Metadata } from "next";

interface PrivatePageProps {
  params: Promise<{ locale: string }>;
}

const BREADCRUMB_NAME = { ja: "貸切・法人", en: "Private & Corporate" } as const;

export async function generateMetadata({
  params,
}: PrivatePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const canonicalUrl =
    locale === "ja" ? `${SITE_URL}/private` : `${SITE_URL}/${locale}/private`;

  return {
    title: t("private.title"),
    description: t("private.description", businessHoursDisplayFor(locale)),
    openGraph: buildPageOpenGraph({
      siteName: t("og.siteName"),
      url: canonicalUrl,
      locale,
    }),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/private`,
        en: `${SITE_URL}/en/private`,
        "x-default": `${SITE_URL}/private`,
      },
    },
  };
}

export default async function PrivatePage({ params }: PrivatePageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  return (
    <main className="bg-deep-black min-h-screen">
      <StructuredData
        data={buildBreadcrumb(locale, [
          { name: BREADCRUMB_NAME[locale], path: "/private" },
        ])}
      />
      <HomeNavigation showColumns={isCmsColumnsEnabled()} />
      <PrivateHero />
      <PrivateDetails />
      <PrivateCta />
      <HomeFooter />
    </main>
  );
}
