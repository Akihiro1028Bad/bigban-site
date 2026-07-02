import {
  columnItemSchema,
  type ColumnCategory,
  type ColumnItem,
} from "@/lib/microcms/columnsSchema";

/** microCMS 生レスポンス形状 (locale/articleType/displayMode が配列, category は展開参照)。 */
export interface RawColumnCategory {
  id: string;
  name: string;
  nameEn?: string | null;
  color?: string | null;
  order?: number | null;
}

export interface RawColumnItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  revisedAt?: string;
  title: string;
  slug: string;
  locale: ("ja" | "en")[];
  articleType?: string[] | null;
  category?: RawColumnCategory | null;
  excerpt: string;
  displayMode: ("html" | "rich")[];
  bodyHtml?: string;
  body?: string;
  eyecatch?: { url: string; width: number; height: number };
}

export interface RawColumnList {
  contents: RawColumnItem[];
  totalCount: number;
  offset: number;
  limit: number;
}

export function makeRawColumnCategory(
  overrides: Partial<RawColumnCategory> = {},
): RawColumnCategory {
  return {
    id: "start",
    name: "はじめ方・体験",
    nameEn: "Getting Started",
    color: "#C8FF00",
    order: 1,
    ...overrides,
  };
}

export type ColumnItemOverrides = Partial<
  Omit<RawColumnItem, "locale" | "displayMode">
> & { locale?: ColumnItem["locale"] };

export function makeRawColumnItem(
  overrides: ColumnItemOverrides = {},
): RawColumnItem {
  const { locale, ...rest } = overrides;
  return {
    id: "col123",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    publishedAt: "2026-04-01T00:00:00.000Z",
    revisedAt: "2026-04-01T00:00:00.000Z",
    title: "ダミーコラム",
    slug: "dummy-column",
    locale: locale ? [locale] : ["ja"],
    articleType: ["獲得"],
    category: makeRawColumnCategory(),
    excerpt: "ダミー抜粋",
    displayMode: ["html"],
    bodyHtml: "<p>ダミー本文</p>",
    body: "",
    eyecatch: {
      url: "https://images.microcms-assets.io/assets/x/test.jpg",
      width: 1200,
      height: 630,
    },
    ...rest,
  };
}

export function makeRawColumnList(
  items: RawColumnItem[],
  totalCount?: number,
): RawColumnList {
  return {
    contents: items,
    totalCount: totalCount ?? items.length,
    offset: 0,
    limit: 12,
  };
}

export function makeRawColumnCategoryList(
  items: RawColumnCategory[],
  totalCount?: number,
): { contents: RawColumnCategory[]; totalCount: number; offset: number; limit: number } {
  return {
    contents: items,
    totalCount: totalCount ?? items.length,
    offset: 0,
    limit: 100,
  };
}

/** Zod transform 済みの ColumnItem を返す (Server Component テスト用)。 */
export function makeParsedColumnItem(
  overrides: ColumnItemOverrides = {},
): ColumnItem {
  return columnItemSchema.parse(makeRawColumnItem(overrides));
}

/** Zod transform 済みの ColumnCategory を返す。 */
export function makeParsedColumnCategory(
  overrides: Partial<RawColumnCategory> = {},
): ColumnCategory {
  const raw = makeRawColumnCategory(overrides);
  return {
    id: raw.id,
    name: raw.name,
    nameEn: raw.nameEn ?? undefined,
    color: raw.color ?? undefined,
    order: raw.order ?? undefined,
  };
}
