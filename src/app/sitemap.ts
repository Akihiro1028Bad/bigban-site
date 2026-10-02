import type { MetadataRoute } from "next";

import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { SITEMAP_ROUTES } from "@/constants/routes";
import { SITE_URL } from "@/constants/site";
import { getColumnSlugs } from "@/lib/microcms/columnsQueries";
import { getNewsSlugs } from "@/lib/microcms/queries";

interface LocaleSlug {
  locale: "ja" | "en";
  slug: string;
  updatedAt?: string;
}

/** `/news` or `/columns` 等のセグメントについて ja/en の URL を組み立てる。 */
function localizedUrl(segment: string, locale: "ja" | "en", slug: string): string {
  return locale === "ja"
    ? `${SITE_URL}/${segment}/${slug}`
    : `${SITE_URL}/en/${segment}/${slug}`;
}

/**
 * コンテンツ詳細ページのサイトマップエントリを組み立てる。
 * slug ごとに ja / en の両方が存在する時のみ alternates.languages を出す。
 */
function detailEntries(
  segment: string,
  slugs: LocaleSlug[],
): MetadataRoute.Sitemap {
  const slugLocales = new Map<string, Set<"ja" | "en">>();
  for (const { slug, locale } of slugs) {
    if (!slugLocales.has(slug)) slugLocales.set(slug, new Set());
    slugLocales.get(slug)?.add(locale);
  }

  return slugs.map(({ locale, slug, updatedAt }) => {
    /* istanbul ignore next -- @preserve slugLocales は事前に populate するため必ず存在 (defensive) */
    const localesForSlug = slugLocales.get(slug) ?? new Set([locale]);
    const hasBoth = localesForSlug.has("ja") && localesForSlug.has("en");
    return {
      url: localizedUrl(segment, locale, slug),
      changeFrequency: "monthly",
      priority: 0.6,
      ...(updatedAt ? { lastModified: updatedAt } : {}),
      ...(hasBoth
        ? {
            alternates: {
              languages: {
                ja: `${SITE_URL}/${segment}/${slug}`,
                en: `${SITE_URL}/en/${segment}/${slug}`,
                "x-default": `${SITE_URL}/${segment}/${slug}`,
              },
            },
          }
        : {}),
    };
  });
}

/**
 * ja / en の両方が存在するページについて、言語版ごとに独立したエントリを組み立てる。
 * Google は hreflang をサイトマップで宣言する場合、言語版ごとに <url>(<loc>) を
 * 1つずつ置き、それぞれに同じ alternates を持たせることを求めている。
 */
function bilingualEntries(
  jaUrl: string,
  enUrl: string,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  priority: number,
): MetadataRoute.Sitemap {
  return [jaUrl, enUrl].map((url) => ({
    url,
    changeFrequency,
    priority,
    alternates: {
      languages: { ja: jaUrl, en: enUrl, "x-default": jaUrl },
    },
  }));
}

/** 一覧 (index) ページのエントリ。 */
function indexEntries(segment: string): MetadataRoute.Sitemap {
  return bilingualEntries(
    `${SITE_URL}/${segment}`,
    `${SITE_URL}/en/${segment}`,
    "weekly",
    0.7,
  );
}

/** 英語コラムが0件のときの一覧エントリ(日本語のみ・hreflang なし)。 */
function japaneseOnlyIndexEntry(segment: string): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/${segment}`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];
}

/**
 * ビルド時の静的生成だけだと、デプロイ後に microCMS で公開した記事が次の
 * デプロイまで sitemap に載らない。Webhook の再生成に加え、1時間ごとにも
 * 再生成して取りこぼしを自己修復する。
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = SITEMAP_ROUTES.flatMap(
    ({ path, priority, changeFrequency }) => {
      const jaPath = path === "/" ? "" : path;
      const enPath = path === "/" ? "/en" : `/en${path}`;
      return bilingualEntries(
        `${SITE_URL}${jaPath}`,
        `${SITE_URL}${enPath}`,
        changeFrequency,
        priority,
      );
    },
  );

  const newsIndex: MetadataRoute.Sitemap = indexEntries("news");

  let newsSlugs: LocaleSlug[] = [];
  try {
    newsSlugs = await getNewsSlugs();
  } catch {
    /* istanbul ignore next -- @preserve microCMS 未設定/未到達時の防御フォールバック */
    newsSlugs = [];
  }
  const newsDetails = detailEntries("news", newsSlugs);

  // columns はフラグ ON のときだけ列挙する (P4〜P6 前は出さない)。
  const columnsEntries: MetadataRoute.Sitemap = [];
  if (isCmsColumnsEnabled()) {
    let columnSlugs: LocaleSlug[] = [];
    try {
      columnSlugs = await getColumnSlugs();
    } catch {
      columnSlugs = [];
    }
    // 英語コラムが0件の間は、空の /en/columns を載せず、日本語一覧も hreflang なしにする。
    const hasEnglishColumns = columnSlugs.some(({ locale }) => locale === "en");
    columnsEntries.push(
      ...(hasEnglishColumns
        ? indexEntries("columns")
        : japaneseOnlyIndexEntry("columns")),
    );
    columnsEntries.push(...detailEntries("columns", columnSlugs));
  }

  return [...staticEntries, ...newsIndex, ...newsDetails, ...columnsEntries];
}
