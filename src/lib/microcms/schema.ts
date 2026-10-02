import { z } from "zod";

import { NEWS_CATEGORIES, type NewsCategoryId } from "@/constants/news";

// microCMS の locale / displayMode は **単一選択セレクト** で運用 (戻り値は string)。
// 後方互換のため `["ja"]` 形式 (複数選択) も受理する。
const localeEnum = z.enum(["ja", "en"]);
const localeSelect = z.union([
  localeEnum,
  z
    .array(localeEnum)
    .min(1)
    .max(1)
    .transform((v) => v[0]),
]);

const displayModeEnum = z.enum(["html", "rich"]);
const displayModeSelect = z.union([
  displayModeEnum,
  z
    .array(displayModeEnum)
    .min(1)
    .max(1)
    .transform((v) => v[0]),
]);

// microCMS の category 選択肢は **日本語ラベル** で運用 (非エンジニア配慮)。
// サイト内部は英語IDで扱うため、ここで日本語→ID 変換 transform を入れる。
// 後方互換のため英語ID直接入力も受理する。
const VALID_IDS = new Set<string>(NEWS_CATEGORIES.map((c) => c.id));
const JA_LABEL_TO_ID = new Map<string, NewsCategoryId>(
  NEWS_CATEGORIES.map((c) => [c.labelJa, c.id]),
);

const categoryEnum = z.string().transform((v, ctx) => {
  if (VALID_IDS.has(v)) return v as NewsCategoryId;
  const id = JA_LABEL_TO_ID.get(v);
  if (id) return id;
  ctx.addIssue({
    code: "custom",
    message: `unknown category: ${v}`,
  });
  return z.NEVER;
});

const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, "slug must match /^[a-z0-9-]+$/");

const eyecatch = z.object({
  url: z.string().url(),
  width: z.number(),
  height: z.number(),
});

const externalLink = z.object({
  label: z.string(),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), {
      message: "externalLink.url must start with https://",
    }),
});

// microCMS は未入力フィールドを `null` で返すため、`optional()` だけだと
// (undefined のみ許容) パースに失敗する。`nullish()` で undefined と null
// 両対応にする。string 系はさらに `transform` で空文字に正規化。
// `.optional()` を最後に重ねてプロパティ自体を任意化する (型推論で `?` 付きに)。
const optionalString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined)
  .optional();

const optionalStringWithDefault = z
  .string()
  .nullish()
  .transform((v) => v ?? "")
  .optional();

export const newsItemSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: optionalString,
  revisedAt: optionalString,
  title: z.string(),
  slug: slugSchema,
  locale: localeSelect,
  category: z.array(categoryEnum).min(1),
  excerpt: z.string(),
  displayMode: displayModeSelect,
  bodyHtml: optionalStringWithDefault,
  body: optionalStringWithDefault,
  eyecatch: eyecatch
    .nullish()
    .transform((v) => v ?? undefined)
    .optional(),
  externalLink: externalLink
    .nullish()
    .transform((v) => v ?? undefined)
    .optional(),
  // 終了日時(microCMS の「日時」フィールド。任意)。過ぎると「終了」表示になる。
  eventEndAt: optionalString,
});
export type NewsItem = z.infer<typeof newsItemSchema>;

export const newsListSchema = z.object({
  contents: z.array(newsItemSchema),
  totalCount: z.number(),
  offset: z.number(),
  limit: z.number(),
});
export type NewsList = z.infer<typeof newsListSchema>;
