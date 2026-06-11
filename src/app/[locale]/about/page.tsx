import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import StructuredData from "@/components/StructuredData";
import { isCmsNewsEnabled } from "@/config/featureFlags";
import { ABOUT_NEWS_LIMIT } from "@/constants/news";
import { SITE_URL, OG_IMAGE } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import { parseKeywords } from "@/lib/og-utils";
import { getNewsList } from "@/lib/microcms/queries";
import { buildBreadcrumb } from "@/lib/structured-data";
import type { NewsItem } from "@/lib/microcms/schema";

import AboutContent from "./AboutContent";

// About ページ内の NEWS セクションは microCMS から最新ニュースを取得するため、
// 静的生成 + Vercel CDN キャッシュにすると、microCMS Webhook 経由の
// `revalidateTag("news")` が CDN まで伝播せず、`x-vercel-cache: HIT` で
// 古い HTML が配信され続ける現象が確認された (本番で再現)。
// /news 一覧・詳細ページと方針を統一し、リクエスト時動的レンダリングに固定する。
// データ層は microCMS タグキャッシュ (next.tags) で引き続きキャッシュされる。
export const dynamic = "force-dynamic";

interface AboutPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: AboutPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const keywords = parseKeywords(t.raw("about.keywords"));
  const canonicalUrl =
    locale === "ja" ? `${SITE_URL}/about` : `${SITE_URL}/${locale}/about`;

  return {
    title: t("about.title"),
    description: t("about.description"),
    keywords,
    openGraph: {
      title: t("about.title"),
      description: t("about.description"),
      url: canonicalUrl,
      locale: locale === "ja" ? "ja_JP" : "en_US",
      images: [OG_IMAGE],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/about`,
        en: `${SITE_URL}/en/about`,
        "x-default": `${SITE_URL}/about`,
      },
    },
  };
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  let newsItems: NewsItem[] = [];
  if (isCmsNewsEnabled()) {
    try {
      const list = await getNewsList({
        locale,
        limit: ABOUT_NEWS_LIMIT,
        offset: 0,
      });
      newsItems = list.contents;
    } catch {
      /* istanbul ignore next -- @preserve microCMS 未到達時の防御フォールバック */
      newsItems = [];
    }
  }

  return (
    <>
      <StructuredData
        data={buildBreadcrumb(locale, [{ name: "About", path: "/about" }])}
      />
      <AboutContent newsItems={newsItems} locale={locale} />
    </>
  );
}
