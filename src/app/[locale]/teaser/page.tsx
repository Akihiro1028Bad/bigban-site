import { getTranslations } from "next-intl/server";

import { SITE_URL } from "@/constants/site";
import { parseKeywords } from "@/lib/og-utils";
import { buildPageOpenGraph } from "@/lib/metadata/pageOpenGraph";

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
    openGraph: buildPageOpenGraph({
      siteName: t("og.siteName"),
      url: canonicalUrl,
      locale,
    }),
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
