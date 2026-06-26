import type { MetadataRoute } from "next";

import { SITEMAP_ROUTES } from "@/constants/routes";
import { SITE_URL } from "@/constants/site";
import { getNewsSlugs } from "@/lib/microcms/queries";

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
          languages: {
            ja: jaUrl,
            en: enUrl,
            "x-default": jaUrl,
          },
        },
      };
    },
  );

  const newsIndex: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/news`,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: {
        languages: {
          ja: `${SITE_URL}/news`,
          en: `${SITE_URL}/en/news`,
          "x-default": `${SITE_URL}/news`,
        },
      },
    },
  ];

  let slugs: Awaited<ReturnType<typeof getNewsSlugs>> = [];
  try {
    slugs = await getNewsSlugs();
  } catch {
    /* istanbul ignore next -- @preserve microCMS 未設定/未到達時の防御フォールバック */
    slugs = [];
  }
  // slug ごとに ja / en の両方が存在する時のみ alternates.languages を出す。
  // getNewsSlugs() が両 locale を返してくれるため、追加 API 呼び出しなしで判定可能。
  const slugLocales = new Map<string, Set<"ja" | "en">>();
  for (const { slug, locale } of slugs) {
    if (!slugLocales.has(slug)) slugLocales.set(slug, new Set());
    slugLocales.get(slug)?.add(locale);
  }

  const newsDetails: MetadataRoute.Sitemap = slugs.map(
    ({ locale, slug, updatedAt }) => {
      const url =
        locale === "ja"
          ? `${SITE_URL}/news/${slug}`
          : `${SITE_URL}/en/news/${slug}`;
      /* istanbul ignore next -- @preserve slugLocales は事前に slugs から populate するため必ず存在 (defensive ?? 分岐は到達不可) */
      const localesForSlug = slugLocales.get(slug) ?? new Set([locale]);
      const hasBoth = localesForSlug.has("ja") && localesForSlug.has("en");
      return {
        url,
        changeFrequency: "monthly",
        priority: 0.6,
        ...(updatedAt ? { lastModified: updatedAt } : {}),
        ...(hasBoth
        ? {
            alternates: {
              languages: {
                ja: `${SITE_URL}/news/${slug}`,
                en: `${SITE_URL}/en/news/${slug}`,
                "x-default": `${SITE_URL}/news/${slug}`,
              },
            },
          }
        : {}),
    };
  });

  return [...staticEntries, ...newsIndex, ...newsDetails];
}
