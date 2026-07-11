import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import HomeFooter from "@/components/home/HomeFooter";
import HomeNavigation from "@/components/home/HomeNavigation";
import { CategoryChips } from "@/components/news/CategoryChips";
import { NewsCard } from "@/components/news/NewsCard";
import { NewsPagination } from "@/components/news/NewsPagination";
import { isCmsColumnsEnabled, isCmsNewsEnabled } from "@/config/featureFlags";
import {
  NEWS_CATEGORIES,
  NEWS_PAGE_SIZE,
  type NewsCategoryId,
} from "@/constants/news";
import { parseLocale, routing } from "@/i18n/routing";
import { getNewsList } from "@/lib/microcms/queries";
import { buildBreadcrumb } from "@/lib/structured-data";
import StructuredData from "@/components/StructuredData";
import { SITE_URL, OG_IMAGE } from "@/constants/site";

// searchParams (?category=&page=) は generateStaticParams で静的生成された
// ロケール別ページと矛盾するため、ページ全体を動的レンダリングに固定する。
// データ層は microCMS タグキャッシュ (next.tags) で引き続きキャッシュされる。
export const dynamic = "force-dynamic";

interface NewsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseCategory(raw: string): NewsCategoryId | null {
  const found = NEWS_CATEGORIES.find((c) => c.id === raw);
  return found ? found.id : null;
}

function parsePage(raw: string | string[] | undefined): number {
  if (typeof raw !== "string") return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === "ja" ? "ニュース" : "News";
  const description =
    locale === "ja"
      ? "最新のお知らせ・メディア掲載・イベント情報"
      : "Latest announcements, media coverage, and event information";
  const canonicalUrl =
    locale === "ja" ? `${SITE_URL}/news` : `${SITE_URL}/${locale}/news`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      locale: locale === "ja" ? "ja_JP" : "en_US",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      images: [OG_IMAGE.url],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/news`,
        en: `${SITE_URL}/en/news`,
        "x-default": `${SITE_URL}/news`,
      },
    },
  };
}

export default async function NewsPage({
  params,
  searchParams,
}: NewsPageProps) {
  if (!isCmsNewsEnabled()) notFound();

  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  const sp = await searchParams;

  let category: NewsCategoryId | undefined;
  if (typeof sp.category === "string") {
    const parsed = parseCategory(sp.category);
    if (parsed === null) notFound();
    category = parsed;
  }

  const page = parsePage(sp.page);
  const offset = (page - 1) * NEWS_PAGE_SIZE;

  const t = await getTranslations("News");
  const list = await getNewsList({
    locale: locale,
    limit: NEWS_PAGE_SIZE,
    offset,
    category,
  });

  const totalPages = Math.max(
    1,
    Math.ceil(list.totalCount / NEWS_PAGE_SIZE),
  );
  if (page > totalPages && list.totalCount > 0) notFound();

  return (
    <>
      <StructuredData
        data={buildBreadcrumb(locale, [{ name: "News", path: "/news" }])}
      />
      <HomeNavigation showColumns={isCmsColumnsEnabled()} />
      <main className="min-h-screen bg-deep-black text-text-light pt-[calc(6rem+var(--promo-banner-h))] lg:pt-[calc(7rem+var(--promo-banner-h))] pb-16 lg:pb-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-12 py-8 lg:py-12">
          <p className="text-xs tracking-[0.3em] text-text-gray uppercase mb-4">
            News
          </p>
          <h1 className="text-text-light text-3xl lg:text-4xl font-bold mb-8">
            {t("heading")}
          </h1>
          <CategoryChips locale={locale} activeCategory={category} />
          {list.contents.length === 0 ? (
            <p className="text-text-gray py-16">
              {locale === "ja"
                ? "現在表示できるニュースはありません。"
                : "No news to show right now."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {list.contents.map((item) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    locale={locale}
                  />
                ))}
              </div>
              <NewsPagination
                currentPage={page}
                totalPages={totalPages}
                locale={locale}
                category={category}
              />
            </>
          )}
        </div>
      </main>
      <HomeFooter />
    </>
  );
}
