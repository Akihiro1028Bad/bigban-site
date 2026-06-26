import { microcmsFetch } from "./client";
import {
  newsItemSchema,
  newsListSchema,
  type NewsItem,
  type NewsList,
} from "./schema";
import {
  DETAIL_PAGE_STATIC_LIMIT,
  NEWS_CATEGORIES,
  type NewsCategoryId,
} from "@/constants/news";

type Locale = "ja" | "en";

// microCMS の category は日本語ラベルで保存されているため、
// 内部ID (notice 等) → 日本語ラベル (お知らせ 等) に変換してフィルタ送信する。
function categoryFilterValue(id: NewsCategoryId): string {
  const found = NEWS_CATEGORIES.find((c) => c.id === id);
  /* istanbul ignore next -- @preserve TS の NewsCategoryId 型により ?? id 分岐は到達不可 (defensive) */
  return found?.labelJa ?? id;
}

/**
 * 防御的ロギング: 公開版経路 (draftKey なし) の取得結果に下書きが
 * 紛れていないかチェック。`updatedAt > revisedAt` は「公開後に編集して
 * 下書き保存している」状態を示し、API キーに「下書き全取得」権限が
 * ON になっていると公開版 API でも下書きが返ってくる事故が起きうる。
 * 開発・本番ログから検知できるよう warn を出す (本番でも有効、頻発しないため)。
 */
function warnIfDraftLeak(item: NewsItem): void {
  if (item.revisedAt && item.updatedAt > item.revisedAt) {
    console.warn(
      `[microcms] possible draft leak detected: id=${item.id} slug=${item.slug} updatedAt(${item.updatedAt}) > revisedAt(${item.revisedAt}). Check API key permission ("GET draft" should be OFF for public-facing key).`,
    );
  }
}

export interface GetNewsListParams {
  locale: Locale;
  limit: number;
  offset: number;
  category?: NewsCategoryId;
}

export async function getNewsList({
  locale,
  limit,
  offset,
  category,
}: GetNewsListParams): Promise<NewsList> {
  const filters = category
    ? `locale[contains]${locale}[and]category[contains]${categoryFilterValue(category)}`
    : `locale[contains]${locale}`;
  const result = await microcmsFetch("news", newsListSchema, {
    searchParams: { filters, orders: "-publishedAt", limit, offset },
    tags: [
      "news",
      `news-list-${locale}${category ? `-${category}` : ""}`,
    ],
  });
  for (const item of result.contents) warnIfDraftLeak(item);
  return result;
}

export interface GetNewsDetailParams {
  locale: Locale;
  slug: string;
}

/**
 * 公開版の詳細を slug + locale で取得する。
 * プレビュー (ドラフト) 取得は別関数 `getNewsByContentId` を使う
 * (microCMS の draftKey は単一GET API でのみ確実に動くため)。
 */
export async function getNewsDetail({
  locale,
  slug,
}: GetNewsDetailParams): Promise<NewsItem | null> {
  const list = await microcmsFetch("news", newsListSchema, {
    searchParams: {
      filters: `slug[equals]${slug}[and]locale[contains]${locale}`,
      limit: 1,
    },
    tags: ["news", `news-${slug}-${locale}`],
  });
  const item = list.contents[0] ?? null;
  if (item) warnIfDraftLeak(item);
  return item;
}

export interface GetNewsByContentIdParams {
  id: string;
  draftKey?: string;
}

/**
 * microCMS contentId 直接指定でレコード取得 (画面プレビューから利用)。
 * GET /api/v1/news/{id}?draftKey=... で単一コンテンツを返す。
 * 取得失敗 (404 / Zod parse 失敗) は null を返す。
 */
export async function getNewsByContentId({
  id,
  draftKey,
}: GetNewsByContentIdParams): Promise<NewsItem | null> {
  try {
    return await microcmsFetch(`news/${id}`, newsItemSchema, {
      tags: ["news", `news-${id}`],
      draftKey,
    });
  } catch {
    return null;
  }
}

export interface NewsSlug {
  locale: Locale;
  slug: string;
  // sitemap の lastModified（鮮度シグナル）に使用。
  updatedAt: string;
}

export async function getNewsSlugs(): Promise<NewsSlug[]> {
  const results: NewsSlug[] = [];
  for (const locale of ["ja", "en"] as const) {
    const list = await microcmsFetch("news", newsListSchema, {
      searchParams: {
        filters: `locale[contains]${locale}`,
        limit: DETAIL_PAGE_STATIC_LIMIT,
      },
      tags: ["news", `news-slugs-${locale}`],
    });
    // 上限超過時は warn を出して運用者に検知させる。
    // 実際の超過時は反復取得 (offset を進める) を実装する必要がある。
    if (list.totalCount > DETAIL_PAGE_STATIC_LIMIT) {
      console.warn(
        `[microcms] getNewsSlugs locale=${locale} totalCount=${list.totalCount} exceeds limit=${DETAIL_PAGE_STATIC_LIMIT}. ${list.totalCount - DETAIL_PAGE_STATIC_LIMIT} 件の slug が sitemap / generateStaticParams から漏れます。queries.ts に offset 反復取得を実装してください。`,
      );
    }
    for (const item of list.contents) {
      results.push({ locale, slug: item.slug, updatedAt: item.updatedAt });
    }
  }
  return results;
}
