import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SITE_URL, resolveCalendarTabKey } from "@/constants/site";
import { parseLocale } from "@/i18n/routing";
import { buildBreadcrumb } from "@/lib/structured-data";
import StructuredData from "@/components/StructuredData";
import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import ReserveHero from "@/components/reserve/ReserveHero";
import ReserveChoice from "@/components/reserve/ReserveChoice";
import ReserveSteps from "@/components/reserve/ReserveSteps";
import ReserveCalendar from "@/components/reserve/ReserveCalendar";
import ReserveInfo from "@/components/reserve/ReserveInfo";
import ReserveFaq from "@/components/reserve/ReserveFaq";
import { buildPageOpenGraph } from "@/lib/metadata/pageOpenGraph";

import type { Metadata } from "next";

/**
 * ⚠️ 一時対応フラグ（予約システム移行の暫定措置）。
 *
 * true  … 暫定の「予約案内ページ」（ReserveChoice：7月=RESERVA / 8月以降=labola の二択）
 * false … 既存の labola 埋め込み版（ReserveSteps + ReserveCalendar）に復元
 *
 * labola 本番運用に切り替えたら、このフラグを false に戻すだけで既存ページに復元される。
 * （埋め込み版のコード・タブ解決ロジックはこのファイルにそのまま残してある）
 *
 * ⚠️ false に戻す際は、案内ページ前提の文言も併せて戻すこと:
 * `Reserve.faq.items[1]`（4つの予約先から選ぶ案内）と
 * `Metadata.reserve.description`（予約案内ページ）はこのフラグの外にあり、
 * 埋め込み版に戻すとページに無い導線を説明したままになる。
 */
const RESERVE_GUIDANCE_MODE = true;

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
    openGraph: buildPageOpenGraph({
      siteName: t("og.siteName"),
      url: canonicalUrl,
      locale,
    }),
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

  // 埋め込み版（RESERVE_GUIDANCE_MODE=false 時）で使うタブ初期値。
  const { tab } = await searchParams;
  const initialTab = resolveCalendarTabKey(tab);

  // RESERVE_GUIDANCE_MODE は常に true のため false（埋め込み版）側は到達不可。
  // ロールバック用に残す意図的な dead branch なのでカバレッジ計測から除外する。
  /* istanbul ignore next -- @preserve ロールバック用フラグ分岐: 埋め込み版(false)側は到達不可 */
  const reserveBody = RESERVE_GUIDANCE_MODE ? (
    <ReserveChoice />
  ) : (
    <>
      <ReserveSteps />
      <ReserveCalendar initialTab={initialTab} />
    </>
  );

  return (
    <main className="bg-deep-black min-h-screen">
      <StructuredData
        data={buildBreadcrumb(locale, [{ name: "Reserve", path: "/reserve" }])}
      />
      <HomeNavigation showColumns={isCmsColumnsEnabled()} />
      <ReserveHero />
      {reserveBody}
      <ReserveInfo />
      <ReserveFaq />
      <HomeFooter />
    </main>
  );
}
