import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SITE_URL, resolveCalendarTabKey } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import ReserveHero from "@/components/reserve/ReserveHero";
import ReserveSteps from "@/components/reserve/ReserveSteps";
import ReserveCalendar from "@/components/reserve/ReserveCalendar";
import ReserveInfo from "@/components/reserve/ReserveInfo";

import type { Metadata } from "next";

interface ReserveMetadataProps {
  params: Promise<{ locale: string }>;
}

interface ReservePageProps extends ReserveMetadataProps {
  searchParams: Promise<{ tab?: string | string[] }>;
}

export async function generateMetadata({
  params,
}: ReserveMetadataProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const canonicalUrl =
    locale === "ja" ? `${SITE_URL}/reserve` : `${SITE_URL}/${locale}/reserve`;

  return {
    title: t("reserve.title"),
    description: t("reserve.description"),
    openGraph: {
      title: t("reserve.title"),
      description: t("reserve.description"),
      url: canonicalUrl,
      locale: locale === "ja" ? "ja_JP" : "en_US",
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/reserve`,
        en: `${SITE_URL}/en/reserve`,
        "x-default": `${SITE_URL}/reserve`,
      },
    },
  };
}

export default async function ReservePage({
  params,
  searchParams,
}: ReservePageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  const { tab } = await searchParams;
  const initialTab = resolveCalendarTabKey(tab);

  return (
    <main className="bg-deep-black min-h-screen">
      <HomeNavigation />
      <ReserveHero />
      <ReserveSteps />
      <ReserveCalendar initialTab={initialTab} />
      <ReserveInfo />
      <HomeFooter />
    </main>
  );
}
