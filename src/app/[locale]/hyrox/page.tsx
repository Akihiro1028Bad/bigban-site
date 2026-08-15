import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import StructuredData from "@/components/StructuredData";
import { SITE_URL } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import { parseKeywords } from "@/lib/og-utils";
import { buildBreadcrumb, buildExerciseGym } from "@/lib/structured-data";
import { buildPageOpenGraph } from "@/lib/metadata/pageOpenGraph";

import HyroxContent from "./HyroxContent";

interface HyroxPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: HyroxPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const keywords = parseKeywords(t.raw("hyrox.keywords"));
  const canonicalUrl =
    locale === "ja" ? `${SITE_URL}/hyrox` : `${SITE_URL}/${locale}/hyrox`;

  return {
    title: t("hyrox.title"),
    description: t("hyrox.description"),
    keywords,
    openGraph: buildPageOpenGraph({
      siteName: t("og.siteName"),
      url: canonicalUrl,
      locale,
      images: [
        {
          url: `${SITE_URL}/images/hyrox/promo-card.jpg`,
          width: 2200,
          height: 1467,
          alt: t("hyrox.title"),
        },
      ],
    }),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/hyrox`,
        en: `${SITE_URL}/en/hyrox`,
        "x-default": `${SITE_URL}/hyrox`,
      },
    },
  };
}

export default async function HyroxPage({ params }: HyroxPageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  return (
    <>
      <StructuredData
        data={buildBreadcrumb(locale, [{ name: "HYROX", path: "/hyrox" }])}
      />
      <StructuredData data={buildExerciseGym(locale)} />
      <HyroxContent />
    </>
  );
}
