import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import HomeFooter from "@/components/home/HomeFooter";
import HomeNavigation from "@/components/home/HomeNavigation";
import StructuredData from "@/components/StructuredData";
import { ColumnCard } from "@/components/columns/ColumnCard";
import { ColumnCategoryTabs } from "@/components/columns/ColumnCategoryTabs";
import { ColumnPagination } from "@/components/columns/ColumnPagination";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { COLUMN_PAGE_SIZE } from "@/constants/columns";
import { OG_IMAGE, SITE_URL } from "@/constants/site";
import { parseLocale, routing } from "@/i18n/routing";
import { columnsLabel } from "@/lib/columns/label";
import {
  getColumnCategories,
  getColumnsList,
} from "@/lib/microcms/columnsQueries";
import { buildBreadcrumb } from "@/lib/structured-data";

// searchParams (?category=&page=) が generateStaticParams と矛盾するため
// ページ全体を動的レンダリングに固定する (news 踏襲)。データ層は microCMS
// タグキャッシュ (next.tags) で引き続きキャッシュされる。
export const dynamic = "force-dynamic";

interface ColumnsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parsePage(raw: string | string[] | undefined): number {
  if (typeof raw !== "string") return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

// flag ON のときだけ静的生成対象にする (news 踏襲)。OFF は空配列。
export function generateStaticParams() {
  if (!isCmsColumnsEnabled()) return [];
  return routing.locales.map((locale) => ({ locale }));
}

/** コラム一覧の絶対 URL。ja はロケールプレフィックス無し。 */
function columnsIndexUrl(locale: string): string {
  return locale === "ja" ? `${SITE_URL}/columns` : `${SITE_URL}/en/columns`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const title = columnsLabel(locale);
  const description =
    locale === "ja"
      ? "ピックルボールの始め方・ルール・上達・比較のコラム"
      : "Columns on getting started, rules, skills, and comparisons in pickleball";
  // canonical は news 一覧と同様、?category= / ?page= を含めない自己参照 URL。
  // 絞り込み・ページ送りはすべて一覧 1 ページ目に正規化する。
  const canonicalUrl = columnsIndexUrl(locale);
  return {
    title,
    description,
    // ページ側の openGraph は layout の openGraph を「マージ」ではなく「置換」する。
    // type / siteName を再指定しないと og:type・og:site_name が消えるため明示する。
    openGraph: {
      type: "website",
      siteName: t("og.siteName"),
      title,
      description,
      url: canonicalUrl,
      locale: locale === "ja" ? "ja_JP" : "en_US",
      images: [OG_IMAGE],
    },
    // twitter はあえて指定しない。layout が images 未指定で card だけを設定しており、
    // ここで上書きすると twitter:image の og:image 追従が止まる。
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ja: `${SITE_URL}/columns`,
        en: `${SITE_URL}/en/columns`,
        "x-default": `${SITE_URL}/columns`,
      },
    },
  };
}

export default async function ColumnsPage({
  params,
  searchParams,
}: ColumnsPageProps) {
  if (!isCmsColumnsEnabled()) notFound();

  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  const sp = await searchParams;
  const t = await getTranslations("Columns");

  // カテゴリマスタは動的 (固定配列にしない・§5.1)。タブ生成と category 検証に使う。
  const categories = await getColumnCategories();

  let category: string | undefined;
  if (typeof sp.category === "string") {
    const known = categories.some((c) => c.id === sp.category);
    if (!known) notFound();
    category = sp.category;
  }

  const page = parsePage(sp.page);
  const offset = (page - 1) * COLUMN_PAGE_SIZE;

  const list = await getColumnsList({
    locale,
    limit: COLUMN_PAGE_SIZE,
    offset,
    category,
  });

  const totalPages = Math.max(1, Math.ceil(list.totalCount / COLUMN_PAGE_SIZE));
  if (page > totalPages && list.totalCount > 0) notFound();

  return (
    <>
      <StructuredData
        data={buildBreadcrumb(locale, [
          { name: columnsLabel(locale), path: "/columns" },
        ])}
      />
      <HomeNavigation showColumns={isCmsColumnsEnabled()} />
      <main className="min-h-screen bg-deep-black text-text-light pt-[calc(6rem+var(--promo-banner-h))] lg:pt-[calc(7rem+var(--promo-banner-h))] pb-16 lg:pb-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-12 py-8 lg:py-12">
          <p className="text-xs tracking-[0.3em] text-text-gray uppercase mb-4">
            Column
          </p>
          <h1 className="text-text-light text-3xl lg:text-4xl font-bold mb-8">
            {t("heading")}
          </h1>
          <ColumnCategoryTabs
            locale={locale}
            categories={categories}
            activeCategory={category}
          />
          {list.contents.length === 0 ? (
            <p className="text-text-gray py-16">
              {locale === "ja"
                ? "現在表示できるコラムはありません。"
                : "No columns to show right now."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {list.contents.map((item) => (
                  <ColumnCard key={item.id} item={item} locale={locale} />
                ))}
              </div>
              <ColumnPagination
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
