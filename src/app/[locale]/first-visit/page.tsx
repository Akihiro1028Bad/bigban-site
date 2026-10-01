import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import StructuredData from "@/components/StructuredData";
import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import FirstVisitHero from "@/components/firstVisit/FirstVisitHero";
import FirstVisitFlow from "@/components/firstVisit/FirstVisitFlow";
import FirstVisitFacts from "@/components/firstVisit/FirstVisitFacts";
import FirstVisitPricing from "@/components/firstVisit/FirstVisitPricing";
import FirstVisitNext from "@/components/firstVisit/FirstVisitNext";
import FirstVisitFaq from "@/components/firstVisit/FirstVisitFaq";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import {
  FIRST_VISIT_PATH,
  businessHoursValues,
} from "@/constants/firstVisit";
import { SITE_URL } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import { buildPageOpenGraph } from "@/lib/metadata/pageOpenGraph";
import { buildBreadcrumb } from "@/lib/structured-data";

import type { Metadata } from "next";

interface FirstVisitPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: FirstVisitPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const canonicalUrl =
    locale === "ja"
      ? `${SITE_URL}${FIRST_VISIT_PATH}`
      : `${SITE_URL}/${locale}${FIRST_VISIT_PATH}`;

  return {
    title: t("firstVisit.title"),
    description: t("firstVisit.description", businessHoursValues(locale)),
    openGraph: buildPageOpenGraph({
      siteName: t("og.siteName"),
      url: canonicalUrl,
      locale,
    }),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}${FIRST_VISIT_PATH}`,
        en: `${SITE_URL}/en${FIRST_VISIT_PATH}`,
        "x-default": `${SITE_URL}${FIRST_VISIT_PATH}`,
      },
    },
  };
}

export default async function FirstVisitPage({ params }: FirstVisitPageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  return (
    <main className="bg-deep-black min-h-screen">
      <StructuredData
        data={buildBreadcrumb(locale, [
          { name: "First Visit", path: FIRST_VISIT_PATH },
        ])}
      />
      <HomeNavigation showColumns={isCmsColumnsEnabled()} />
      <FirstVisitHero />
      <FirstVisitFlow />
      <FirstVisitFacts />
      <FirstVisitPricing />
      <FirstVisitNext />
      <FirstVisitFaq />
      <HomeFooter />
    </main>
  );
}
