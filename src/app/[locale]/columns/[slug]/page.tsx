import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import HomeFooter from "@/components/home/HomeFooter";
import HomeNavigation from "@/components/home/HomeNavigation";
import { NewsBodyRenderer } from "@/components/news/NewsBodyRenderer";
import { PreviewBanner } from "@/components/news/PreviewBanner";
import {
  columnCategoryColor,
  columnCategoryName,
} from "@/lib/columns/category";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { SITE_URL } from "@/constants/site";
import { parseLocale, type Locale } from "@/i18n/routing";
import {
  getColumnByContentId,
  getColumnDetail,
  getColumnSlugs,
} from "@/lib/microcms/columnsQueries";
import type { ColumnItem } from "@/lib/microcms/columnsSchema";

// 画面プレビュー (?draftKey=&contentId=) が searchParams を使うため、
// ページ全体を動的レンダリングに固定する (news 詳細踏襲)。
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const CONTENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

function buildColumnUrl(locale: Locale, slug: string): string {
  return locale === "ja"
    ? `${SITE_URL}/columns/${slug}`
    : `${SITE_URL}/en/columns/${slug}`;
}

function pickStringParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * URL クエリ ?contentId= ?draftKey= からプレビュー対象を取得する。
 * - 両パラメータ揃っていない / 形式違反 → null (公開版経路へフォールバック)
 * - microCMS で取得できない → null
 * - locale/slug が URL と一致しない → null (URL 流用防止)
 */
async function readPreviewItem(
  locale: Locale,
  slug: string,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<ColumnItem | null> {
  const contentId = pickStringParam(searchParams, "contentId");
  const draftKey = pickStringParam(searchParams, "draftKey");
  if (!contentId || !draftKey) return null;
  if (!CONTENT_ID_RE.test(contentId)) return null;
  const item = await getColumnByContentId({ id: contentId, draftKey });
  if (!item) return null;
  if (item.locale !== locale || item.slug !== slug) return null;
  return item;
}

export async function generateStaticParams() {
  // flag OFF のうちは静的生成しない (news 踏襲)。
  if (!isCmsColumnsEnabled()) return [];
  try {
    return await getColumnSlugs();
  } catch {
    /* istanbul ignore next -- @preserve microCMS 未到達時の防御 (build 時のみ) */
    return [];
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) return {};

  const sp = await searchParams;
  const previewItem = await readPreviewItem(locale, slug, sp);
  const item = previewItem ?? (await getColumnDetail({ locale, slug }));
  if (!item) return {};

  const meta: Metadata = {
    title: `${item.title} | THE PICKLE BANG THEORY`,
    description: item.excerpt,
  };

  if (previewItem) {
    meta.robots = { index: false, follow: false };
    return meta;
  }

  // OGP: 公開版のみ (プレビューは noindex)。対向 locale が存在すれば alternates。
  const otherLocale: Locale = locale === "ja" ? "en" : "ja";
  const other = await getColumnDetail({ locale: otherLocale, slug });
  if (other) {
    meta.alternates = {
      languages: {
        ja: buildColumnUrl("ja", slug),
        en: buildColumnUrl("en", slug),
      },
    };
  }
  return meta;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function ColumnDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  const sp = await searchParams;
  // プレビューを先に読む。flag OFF 期間でも microCMS プレビューボタンは
  // /columns/[slug] へ飛ぶため、有効なプレビューはフラグを無視して描画する (§5.4)。
  const previewItem = await readPreviewItem(locale, slug, sp);
  if (!previewItem && !isCmsColumnsEnabled()) notFound();

  const item = previewItem ?? (await getColumnDetail({ locale, slug }));
  if (!item) notFound();

  const category = item.category;
  const backHref = locale === "ja" ? "/columns" : "/en/columns";
  const backLabel = locale === "ja" ? "← コラム一覧へ" : "← Column index";

  return (
    <>
      {previewItem && <PreviewBanner locale={locale} />}
      <HomeNavigation />
      <main className="min-h-screen bg-deep-black text-text-light pt-[calc(6rem+var(--promo-banner-h))] lg:pt-[calc(7rem+var(--promo-banner-h))] pb-16 lg:pb-24">
        <article className="mx-auto max-w-3xl px-6 lg:px-12 py-8 lg:py-12">
          <Link
            href={backHref}
            className="text-xs tracking-wider text-text-gray hover:text-accent transition-colors"
          >
            {backLabel}
          </Link>
          <div className="mt-6 flex items-center gap-3 text-xs">
            {category && (
              <span
                className="inline-block px-2 py-0.5 border"
                style={{
                  borderColor: columnCategoryColor(category),
                  color: columnCategoryColor(category),
                }}
              >
                {columnCategoryName(category, locale)}
              </span>
            )}
            <time dateTime={(item.publishedAt ?? item.createdAt).slice(0, 10)}>
              {formatDate(item.publishedAt ?? item.createdAt)}
            </time>
          </div>
          <h1 className="mt-4 text-2xl lg:text-4xl font-bold leading-tight">
            {item.title}
          </h1>
          {item.eyecatch && (
            <div className="mt-8">
              <Image
                src={`${item.eyecatch.url}?w=1200&fm=webp&q=80`}
                alt=""
                width={1200}
                height={Math.round(
                  (item.eyecatch.height / item.eyecatch.width) * 1200,
                )}
                className="w-full h-auto"
                priority
              />
            </div>
          )}
          <div className="mt-10">
            <NewsBodyRenderer
              displayMode={item.displayMode}
              bodyHtml={item.bodyHtml ?? ""}
              body={item.body ?? ""}
              isFirstImageLcp={!item.eyecatch}
              locale={locale}
            />
          </div>
        </article>
      </main>
      <HomeFooter />
    </>
  );
}
