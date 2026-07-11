import { microcmsFetch } from "./client";
import {
  columnCategoryListSchema,
  columnItemSchema,
  columnListSchema,
  type ColumnCategory,
  type ColumnItem,
  type ColumnList,
} from "./columnsSchema";

type Locale = "ja" | "en";

/** slug 全件列挙の1ページ取得件数。offset を進めて totalCount まで反復する。 */
const COLUMN_SLUGS_PAGE_LIMIT = 100;

export interface GetColumnsListParams {
  locale: Locale;
  limit: number;
  offset: number;
  /** column-categories の content ID。カテゴリ絞り込み (単一参照 equals)。 */
  category?: string;
}

/**
 * 公開版のコラム一覧を取得する。参照 `category` を展開するため `depth=1` を付与。
 * カテゴリ絞り込みは microCMS の `category[equals]{contentId}` を使う (news は
 * 日本語ラベルの `contains` だが、columns は安定 content ID の equals で厳密に絞る)。
 */
export async function getColumnsList({
  locale,
  limit,
  offset,
  category,
}: GetColumnsListParams): Promise<ColumnList> {
  const filters = category
    ? `locale[contains]${locale}[and]category[equals]${category}`
    : `locale[contains]${locale}`;
  return microcmsFetch("columns", columnListSchema, {
    searchParams: {
      filters,
      orders: "-publishedAt",
      limit,
      offset,
      depth: 1,
    },
    tags: ["columns", `columns-list-${locale}${category ? `-${category}` : ""}`],
  });
}

export interface GetColumnDetailParams {
  locale: Locale;
  slug: string;
}

/**
 * 公開版のコラム詳細を slug + locale で取得する。
 * プレビュー (ドラフト) 取得は `getColumnByContentId` を使う。
 */
export async function getColumnDetail({
  locale,
  slug,
}: GetColumnDetailParams): Promise<ColumnItem | null> {
  const list = await microcmsFetch("columns", columnListSchema, {
    searchParams: {
      filters: `slug[equals]${slug}[and]locale[contains]${locale}`,
      limit: 1,
      depth: 1,
    },
    tags: ["columns", `columns-${slug}-${locale}`],
  });
  return list.contents[0] ?? null;
}

export interface GetColumnByContentIdParams {
  id: string;
  draftKey?: string;
}

/**
 * microCMS contentId 直接指定でコラムを取得する (画面プレビューから利用)。
 * 取得失敗 (404 / Zod parse 失敗) は null を返す。参照展開のため depth=1。
 */
export async function getColumnByContentId({
  id,
  draftKey,
}: GetColumnByContentIdParams): Promise<ColumnItem | null> {
  try {
    return await microcmsFetch(`columns/${id}`, columnItemSchema, {
      searchParams: { depth: 1 },
      tags: ["columns", `columns-${id}`],
      draftKey,
    });
  } catch {
    return null;
  }
}

/**
 * カテゴリマスタ (`column-categories`) を order 昇順で全件取得する。
 * フィルタタブ・チップ色の単一ソース (動的カテゴリ・AD7/AD9)。
 */
export async function getColumnCategories(): Promise<ColumnCategory[]> {
  const list = await microcmsFetch(
    "column-categories",
    columnCategoryListSchema,
    {
      searchParams: { orders: "order", limit: COLUMN_SLUGS_PAGE_LIMIT },
      tags: ["column-categories"],
    },
  );
  return list.contents;
}

export interface ColumnSlug {
  locale: Locale;
  slug: string;
}

/**
 * 全 locale の (locale, slug) を列挙する。
 *
 * news の `getNewsSlugs` は `DETAIL_PAGE_STATIC_LIMIT` で頭打ちになる既知課題が
 * あるが (queries.ts:135 の警告参照)、columns は記事が増え続ける前提なので
 * **offset を進めて totalCount まで反復取得**し、sitemap / generateStaticParams
 * から漏れが出ないようにする (§5.5)。
 */
export async function getColumnSlugs(): Promise<ColumnSlug[]> {
  const results: ColumnSlug[] = [];
  for (const locale of ["ja", "en"] as const) {
    let offset = 0;
    for (;;) {
      const list = await microcmsFetch("columns", columnListSchema, {
        searchParams: {
          filters: `locale[contains]${locale}`,
          limit: COLUMN_SLUGS_PAGE_LIMIT,
          offset,
        },
        tags: ["columns", `columns-slugs-${locale}`],
      });
      for (const item of list.contents) {
        results.push({ locale, slug: item.slug });
      }
      offset += COLUMN_SLUGS_PAGE_LIMIT;
      if (offset >= list.totalCount || list.contents.length === 0) break;
    }
  }
  return results;
}
