import { getTranslations, setRequestLocale } from "next-intl/server";
import { SITE_URL } from "@/constants/site";
import { parseKeywords } from "@/lib/og-utils";
import TokushohoContent from "./TokushohoContent";
import StructuredData from "@/components/StructuredData";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { buildBreadcrumb } from "@/lib/structured-data";
import { buildPageOpenGraph } from "@/lib/metadata/pageOpenGraph";

import type { Metadata } from "next";

interface TokushohoPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: TokushohoPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const keywords = parseKeywords(t.raw("tokushoho.keywords"));
  const canonicalUrl =
    locale === "ja"
      ? `${SITE_URL}/tokushoho`
      : `${SITE_URL}/${locale}/tokushoho`;

  return {
    title: t("tokushoho.title"),
    description: t("tokushoho.description"),
    keywords,
    openGraph: buildPageOpenGraph({
      siteName: t("og.siteName"),
      url: canonicalUrl,
      locale,
    }),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/tokushoho`,
        en: `${SITE_URL}/en/tokushoho`,
        "x-default": `${SITE_URL}/tokushoho`,
      },
    },
  };
}

export default async function TokushohoPage({ params }: TokushohoPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const breadcrumbName =
    locale === "ja" ? "特定商取引法に基づく表記" : "Legal Notice";

  return (
    <>
      <StructuredData
        data={buildBreadcrumb(locale, [
          { name: breadcrumbName, path: "/tokushoho" },
        ])}
      />
      <TokushohoContent showColumns={isCmsColumnsEnabled()} />
    </>
  );
}
