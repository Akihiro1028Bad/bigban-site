import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import HomeFooter from "@/components/home/HomeFooter";
import HomeNavigation from "@/components/home/HomeNavigation";
import { NewsArticleJsonLd } from "@/components/news/NewsArticleJsonLd";
import { NewsBodyRenderer } from "@/components/news/NewsBodyRenderer";
import StructuredData from "@/components/StructuredData";
import { buildBreadcrumb } from "@/lib/structured-data";
import { PreviewBanner } from "@/components/news/PreviewBanner";
import { isCmsNewsEnabled } from "@/config/featureFlags";
import { EXTERNAL_LINK_PROPS, SITE_URL } from "@/constants/site";
import { parseLocale, type Locale } from "@/i18n/routing";
import {
  getNewsByContentId,
  getNewsDetail,
  getNewsSlugs,
} from "@/lib/microcms/queries";
import type { NewsItem } from "@/lib/microcms/schema";
import { resolveCategories } from "@/lib/news/categories";

// 画面プレビュー (?draftKey=&contentId=) は searchParams を使うため、
// generateStaticParams で静的生成された slug にプレビューパラメータ付きで
// アクセスすると Next.js が "static→dynamic" 矛盾を検出して 500 を返す。
// ページ全体を動的レンダリングに固定することで両立させる。
// データ層は microCMS タグキャッシュ (next.tags) で引き続きキャッシュされる。
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface MetadataProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const CONTENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

function buildNewsUrl(locale: Locale, slug: string): string {
  return locale === "ja"
    ? `${SITE_URL}/news/${slug}`
    : `${SITE_URL}/en/news/${slug}`;
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
 * - 取得できたが locale/slug が URL と一致しない → null (URL 流用防止)
 */
async function readPreviewItem(
  locale: Locale,
  slug: string,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<NewsItem | null> {
  const contentId = pickStringParam(searchParams, "contentId");
  const draftKey = pickStringParam(searchParams, "draftKey");
  if (!contentId || !draftKey) return null;
  if (!CONTENT_ID_RE.test(contentId)) return null;
  const item = await getNewsByContentId({ id: contentId, draftKey });
  if (!item) return null;
  if (item.locale !== locale || item.slug !== slug) return null;
  return item;
}

export async function generateStaticParams() {
  try {
    return await getNewsSlugs();
  } catch {
    /* istanbul ignore next -- @preserve microCMS 未到達時の防御フォールバック (build 時のみ実行) */
    return [];
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: MetadataProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) return {};

  const sp = await searchParams;
  const previewItem = await readPreviewItem(locale, slug, sp);
  const item =
    previewItem ?? (await getNewsDetail({ locale, slug }));
  if (!item) return {};

  const meta: Metadata = {
    title: item.title,
    description: item.excerpt,
  };

  if (previewItem) {
    meta.robots = { index: false, follow: false };
  }

  // alternates は公開版についてのみ算出 (プレビュー時は noindex)。
  // 注: 対向 locale 版が存在するかチェックするため getNewsDetail を 1 回追加発行する。
  // 結果として 1 記事 1 ロケールあたり 2 回 microCMS API を呼ぶ N+1 構造になるが、
  // microCMS レスポンスは ISR タグ (`news-${slug}-${locale}`) でキャッシュされるため、
  // cold start を除けば実コストは無視できる。
  if (!previewItem) {
    const otherLocale: Locale = locale === "ja" ? "en" : "ja";
    const other = await getNewsDetail({ locale: otherLocale, slug });
    if (other) {
      meta.alternates = {
        languages: {
          ja: buildNewsUrl("ja", slug),
          en: buildNewsUrl("en", slug),
        },
      };
    }
  }

  return meta;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function NewsDetailPage({
  params,
  searchParams,
}: PageProps) {
  if (!isCmsNewsEnabled()) notFound();

  const { locale: rawLocale, slug } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  const sp = await searchParams;
  const previewItem = await readPreviewItem(locale, slug, sp);
  const item =
    previewItem ?? (await getNewsDetail({ locale, slug }));
  if (!item) notFound();

  const cats = resolveCategories(item.category);
  const backHref = locale === "ja" ? "/news" : "/en/news";
  const backLabel =
    locale === "ja" ? "← ニュース一覧へ" : "← News index";

  return (
    <>
      {previewItem && <PreviewBanner locale={locale} />}
      <HomeNavigation />
      <NewsArticleJsonLd item={item} locale={locale} />
      <StructuredData
        data={buildBreadcrumb(locale, [
          { name: "News", path: "/news" },
          { name: item.title, path: `/news/${item.slug}` },
        ])}
      />

      <main className="min-h-screen bg-deep-black text-text-light pt-[calc(6rem+var(--promo-banner-h))] lg:pt-[calc(7rem+var(--promo-banner-h))] pb-16 lg:pb-24">
        <article className="mx-auto max-w-3xl px-6 lg:px-12 py-8 lg:py-12">
        <Link
          href={backHref}
          className="text-xs tracking-wider text-text-gray hover:text-accent transition-colors"
        >
          {backLabel}
        </Link>
        <div className="mt-6 flex items-center gap-3 text-xs">
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {cats.map((c) => (
                <span
                  key={c.id}
                  className="inline-block px-2 py-0.5 border"
                  style={{ borderColor: c.color, color: c.color }}
                >
                  {locale === "ja" ? c.labelJa : c.labelEn}
                </span>
              ))}
            </div>
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
        {item.externalLink && (
          <div className="mt-10">
            <a
              href={item.externalLink.url}
              {...EXTERNAL_LINK_PROPS}
              className="inline-flex items-center gap-2 px-6 py-3 border border-accent text-accent text-sm tracking-wider hover:bg-accent hover:text-deep-black transition-colors"
            >
              {item.externalLink.label}
              <span>→</span>
            </a>
          </div>
        )}
        </article>
      </main>
      <HomeFooter />
    </>
  );
}
