import { getTranslations } from "next-intl/server";

import { SITE_URL, OG_IMAGE } from "@/constants/site";
import { parseKeywords } from "@/lib/og-utils";

import TeaserPage from "./TeaserPage";

import type { Metadata } from "next";

interface TeaserPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: TeaserPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const keywords = parseKeywords(t.raw("teaser.keywords"));
  const canonicalUrl =
    locale === "ja" ? `${SITE_URL}/teaser` : `${SITE_URL}/${locale}/teaser`;

  return {
    title: { absolute: t("home.title") },
    description: t("home.description"),
    keywords,
    robots: { index: false, follow: false },
    openGraph: {
      title: t("home.title"),
      description: t("home.description"),
      url: canonicalUrl,
      locale: locale === "ja" ? "ja_JP" : "en_US",
      images: [OG_IMAGE],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/teaser`,
        en: `${SITE_URL}/en/teaser`,
        "x-default": `${SITE_URL}/teaser`,
      },
    },
  };
}

export default function Page() {
  return <TeaserPage />;
}
