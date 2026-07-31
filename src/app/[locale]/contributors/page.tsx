import { getTranslations, setRequestLocale } from "next-intl/server";

import StructuredData from "@/components/StructuredData";
import ContributorsContent from "@/components/contributors/ContributorsContent";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { SITE_URL, OG_IMAGE } from "@/constants/site";
import { parseKeywords } from "@/lib/og-utils";
import { buildBreadcrumb } from "@/lib/structured-data";

import type { Metadata } from "next";

interface ContributorsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ContributorsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const keywords = parseKeywords(t.raw("contributors.keywords"));
  const canonicalUrl =
    locale === "ja"
      ? `${SITE_URL}/contributors`
      : `${SITE_URL}/${locale}/contributors`;

  return {
    title: t("contributors.title"),
    description: t("contributors.description"),
    keywords,
    openGraph: {
      title: t("contributors.title"),
      description: t("contributors.description"),
      url: canonicalUrl,
      locale: locale === "ja" ? "ja_JP" : "en_US",
      images: [OG_IMAGE],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/contributors`,
        en: `${SITE_URL}/en/contributors`,
        "x-default": `${SITE_URL}/contributors`,
      },
    },
  };
}

export default async function ContributorsPage({ params }: ContributorsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const breadcrumbName = locale === "ja" ? "支援者ウォール" : "Contributors";

  return (
    <>
      <StructuredData
        data={buildBreadcrumb(locale, [
          { name: breadcrumbName, path: "/contributors" },
        ])}
      />
      <ContributorsContent showColumns={isCmsColumnsEnabled()} />
    </>
  );
}
