import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { SITE_URL, OG_IMAGE } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import { parseKeywords } from "@/lib/og-utils";
import StructuredData from "@/components/StructuredData";
import { buildServices } from "@/lib/structured-data";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import HomeIntro from "@/components/home/HomeIntro";
import HomeNavigation from "@/components/home/HomeNavigation";
import HomeHero from "@/components/home/HomeHero";
import HomeConcept from "@/components/home/HomeConcept";
import HomeFacility from "@/components/home/HomeFacility";
import HomeServices from "@/components/home/HomeServices";
import HomeHyroxPromo from "@/components/home/HomeHyroxPromo";
import HomePricing from "@/components/home/HomePricing";
import HomeNews from "@/components/home/HomeNews";
import HomeColumns from "@/components/home/HomeColumns";
import HomeAbout from "@/components/home/HomeAbout";
import HomeAccess from "@/components/home/HomeAccess";
import HomeFooter from "@/components/home/HomeFooter";

import type { Metadata } from "next";

// HomeNews の fetch tag が Suspense 境界内のため Full Route Cache に登録されず、
// revalidateTag/revalidatePath が CDN へ伝播しない (本番で再現)。
// About ページ (bc30a56) と同様、動的レンダリングに固定して解決する。
export const dynamic = "force-dynamic";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: HomePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const keywords = parseKeywords(t.raw("home.keywords"));
  const canonicalUrl =
    locale === "ja" ? SITE_URL : `${SITE_URL}/${locale}`;

  return {
    title: { absolute: t("home.title") },
    description: t("home.description"),
    keywords,
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
        ja: SITE_URL,
        en: `${SITE_URL}/en`,
        "x-default": SITE_URL,
      },
    },
  };
}

export default async function Home({ params }: HomePageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  return (
    <HomeIntro>
      <StructuredData data={buildServices()} />
      <main>
        <HomeNavigation showColumns={isCmsColumnsEnabled()} />
        <HomeHero />
        <HomeConcept />
        <HomeFacility />
        <HomeServices />
        <HomeHyroxPromo />
        <HomePricing />
        {/* Suspense で囲むことで microCMS フェッチが遅くても
            HomeAbout 以降のセクションが先にストリーミングされる。
            HomeNews は失敗時/0件時に null を返すため fallback も null で問題ない。 */}
        <Suspense fallback={null}>
          <HomeNews locale={locale} />
        </Suspense>
        <Suspense fallback={null}>
          <HomeColumns locale={locale} />
        </Suspense>
        <HomeAbout />
        <HomeAccess />
        <HomeFooter />
      </main>
    </HomeIntro>
  );
}
