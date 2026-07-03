import type { MetadataRoute } from "next";

import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { SITEMAP_ROUTES } from "@/constants/routes";
import { SITE_URL } from "@/constants/site";
import { getColumnSlugs } from "@/lib/microcms/columnsQueries";
import { getNewsSlugs } from "@/lib/microcms/queries";

interface LocaleSlug {
  locale: "ja" | "en";
  slug: string;
  // 詳細ページの最終更新日時 (microCMS updatedAt)。news は必ず持つが、
  // columns 等 updatedAt を返さないソースでは undefined になりうる。
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

/** 一覧 (index) ページのエントリ。 */
function indexEntry(segment: string): MetadataRoute.Sitemap[number] {
  return {
    url: `${SITE_URL}/${segment}`,
    changeFrequency: "weekly",
    priority: 0.7,
    alternates: {
      languages: {
        ja: `${SITE_URL}/${segment}`,
        en: `${SITE_URL}/en/${segment}`,
        "x-default": `${SITE_URL}/${segment}`,
      },
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = SITEMAP_ROUTES.map(
    ({ path, priority, changeFrequency }) => {
      const jaPath = path === "/" ? "" : path;
      const enPath = path === "/" ? "/en" : `/en${path}`;
      const jaUrl = `${SITE_URL}${jaPath}`;
      const enUrl = `${SITE_URL}${enPath}`;
      return {
        url: jaUrl,
        changeFrequency,
        priority,
        alternates: {
          languages: { ja: jaUrl, en: enUrl, "x-default": jaUrl },
        },
      };
    },
  );

  const newsIndex: MetadataRoute.Sitemap = [indexEntry("news")];

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
    columnsEntries.push(indexEntry("columns"));
    let columnSlugs: LocaleSlug[] = [];
    try {
      columnSlugs = await getColumnSlugs();
    } catch {
      columnSlugs = [];
    }
    columnsEntries.push(...detailEntries("columns", columnSlugs));
  }

  return [...staticEntries, ...newsIndex, ...newsDetails, ...columnsEntries];
}
