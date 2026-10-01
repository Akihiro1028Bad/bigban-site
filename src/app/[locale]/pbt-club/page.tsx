import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import StructuredData from "@/components/StructuredData";
import HomeFooter from "@/components/home/HomeFooter";
import HomeNavigation from "@/components/home/HomeNavigation";
import PbtClubBenefits from "@/components/pbt-club/PbtClubBenefits";
import PbtClubBreakEven from "@/components/pbt-club/PbtClubBreakEven";
import PbtClubComparison from "@/components/pbt-club/PbtClubComparison";
import PbtClubFaq from "@/components/pbt-club/PbtClubFaq";
import PbtClubFit from "@/components/pbt-club/PbtClubFit";
import PbtClubHero from "@/components/pbt-club/PbtClubHero";
import PbtClubJoinCta from "@/components/pbt-club/PbtClubJoinCta";
import PbtClubRates from "@/components/pbt-club/PbtClubRates";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { PBT_CLUB_PATH } from "@/constants/pbtClub";
import { SITE_URL } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import { buildPageOpenGraph } from "@/lib/metadata/pageOpenGraph";
import { buildBreadcrumb } from "@/lib/structured-data";

import type { Metadata } from "next";

interface PbtClubPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PbtClubPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const canonicalUrl =
    locale === "ja"
      ? `${SITE_URL}${PBT_CLUB_PATH}`
      : `${SITE_URL}/${locale}${PBT_CLUB_PATH}`;

  return {
    title: t("pbtClub.title"),
    description: t("pbtClub.description"),
    openGraph: buildPageOpenGraph({
      siteName: t("og.siteName"),
      url: canonicalUrl,
      locale,
    }),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}${PBT_CLUB_PATH}`,
        en: `${SITE_URL}/en${PBT_CLUB_PATH}`,
        "x-default": `${SITE_URL}${PBT_CLUB_PATH}`,
      },
    },
  };
}

export default async function PbtClubPage({ params }: PbtClubPageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  return (
    <main className="bg-deep-black min-h-screen">
      <StructuredData
        data={buildBreadcrumb(locale, [
          { name: "PBT CLUB", path: PBT_CLUB_PATH },
        ])}
      />
      <HomeNavigation showColumns={isCmsColumnsEnabled()} />
      <PbtClubHero />
      <PbtClubBenefits />
      <PbtClubBreakEven />
      <PbtClubRates />
      <PbtClubComparison />
      <PbtClubFit />
      <PbtClubJoinCta />
      <PbtClubFaq />
      <HomeFooter />
    </main>
  );
}
