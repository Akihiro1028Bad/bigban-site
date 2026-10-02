import { newsItemSchema, type NewsItem } from "@/lib/microcms/schema";

/**
 * microCMS API の **生レスポンス形状** (locale / displayMode が配列) を返す。
 * Zod transform 前の入力として `mockResolvedValue({ json: () => ... })` 等で使う。
 */
export interface RawNewsItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  revisedAt?: string;
  title: string;
  slug: string;
  locale: ("ja" | "en")[];
  category: ("notice" | "media" | "event" | "campaign")[];
  excerpt: string;
  displayMode: ("html" | "rich")[];
  bodyHtml?: string;
  body?: string;
  eyecatch?: { url: string; width: number; height: number };
  externalLink?: { label: string; url: string };
  eventEndAt?: string | null;
}

export interface RawNewsList {
  contents: RawNewsItem[];
  totalCount: number;
  offset: number;
  limit: number;
}

export type NewsItemOverrides = Partial<
  Omit<RawNewsItem, "locale" | "displayMode" | "category">
> & {
  locale?: NewsItem["locale"];
  displayMode?: NewsItem["displayMode"];
  category?: NewsItem["category"];
};

export function makeNewsItem(overrides: NewsItemOverrides = {}): RawNewsItem {
  const { locale, displayMode, category, ...rest } = overrides;
  return {
    id: "abc123",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    publishedAt: "2026-04-01T00:00:00.000Z",
    revisedAt: "2026-04-01T00:00:00.000Z",
    title: "ダミータイトル",
    slug: "dummy-slug",
    locale: locale ? [locale] : ["ja"],
    category: category ?? ["notice"],
    excerpt: "ダミー抜粋",
    displayMode: displayMode ? [displayMode] : ["html"],
    bodyHtml: "<p>ダミーHTML本文</p>",
    body: "",
    eyecatch: {
      url: "https://images.microcms-assets.io/assets/xxx/test.jpg",
      width: 1200,
      height: 630,
    },
    ...rest,
  };
}

export function makeNewsList(
  items: RawNewsItem[],
  totalCount?: number,
): RawNewsList {
  return {
    contents: items,
    totalCount: totalCount ?? items.length,
    offset: 0,
    limit: 12,
  };
}

/**
 * Zod transform 済みの `NewsItem` (locale/displayMode が string) を返す。
 * Server Component / クライアントコンポーネントのテストで NewsItem を直接渡すときに使用。
 */
export function makeParsedNewsItem(
  overrides: NewsItemOverrides = {},
): NewsItem {
  return newsItemSchema.parse(makeNewsItem(overrides));
}
