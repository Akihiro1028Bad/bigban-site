import { z } from "zod";

import {
  COLUMN_ARTICLE_TYPES,
  type ColumnArticleTypeId,
} from "@/constants/columns";

// microCMS の locale / displayMode は **単一選択セレクト** で運用 (戻り値は string)。
// 後方互換のため `["ja"]` 形式 (複数選択) も受理する。news スキーマと同パターン。
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

// articleType は news の category と同様、microCMS 側では **日本語ラベル** で運用。
// 内部は英語ID (acquire 等) で扱うため、日本語→ID 変換 transform を入れる。
// 後方互換のため英語ID直接入力も受理する。articleType は内部計測軸のため任意
// (未選択の空配列 / null / プロパティ欠落をすべて undefined に畳む)。
const ARTICLE_TYPE_IDS = new Set<string>(COLUMN_ARTICLE_TYPES.map((t) => t.id));
const JA_LABEL_TO_ARTICLE_TYPE = new Map<string, ColumnArticleTypeId>(
  COLUMN_ARTICLE_TYPES.map((t) => [t.labelJa, t.id]),
);

const articleTypeLabel = z.string().transform((v, ctx) => {
  if (ARTICLE_TYPE_IDS.has(v)) return v as ColumnArticleTypeId;
  const id = JA_LABEL_TO_ARTICLE_TYPE.get(v);
  if (id) return id;
  ctx.addIssue({ code: "custom", message: `unknown articleType: ${v}` });
  return z.NEVER;
});

// microCMS のセレクト戻り値は単一文字列 or 配列。未選択は `[]` または null。
// いずれも undefined に正規化する (欠落耐性)。
const articleTypeSelect = z
  .union([
    articleTypeLabel,
    z
      .array(articleTypeLabel)
      .max(1)
      .transform((v) => v[0]),
  ])
  .nullish()
  .transform((v) => v ?? undefined)
  .optional();

const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, "slug must match /^[a-z0-9-]+$/");

const eyecatch = z.object({
  url: z.string().url(),
  width: z.number(),
  height: z.number(),
});

// microCMS は未入力フィールドを `null` で返すため、`optional()` だけだと
// (undefined のみ許容) パースに失敗する。`nullish()` で undefined と null
// 両対応にする。string 系はさらに `transform` で空文字に正規化する。
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

const optionalNumber = z
  .number()
  .nullish()
  .transform((v) => v ?? undefined)
  .optional();

/**
 * `column-categories` マスタを depth=1 で展開した参照値のスキーマ。
 * 参照先が下書き / 削除済みだと microCMS は `null` を返すため、呼び出し側で
 * `nullish` を重ねて欠落耐性を持たせる (このスキーマ自体は「値がある時」の形)。
 * color / nameEn / order の未設定はフロント側でフォールバック (既定色 / name)。
 */
export const columnCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  nameEn: optionalString,
  color: optionalString,
  order: optionalNumber,
});
export type ColumnCategory = z.infer<typeof columnCategorySchema>;

export const columnCategoryListSchema = z.object({
  contents: z.array(columnCategorySchema),
  totalCount: z.number(),
  offset: z.number(),
  limit: z.number(),
});
export type ColumnCategoryList = z.infer<typeof columnCategoryListSchema>;

export const columnItemSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: optionalString,
  revisedAt: optionalString,
  title: z.string(),
  slug: slugSchema,
  locale: localeSelect,
  articleType: articleTypeSelect,
  // 参照先が下書き / 削除だと null。単一参照 (1記事1カテゴリ) で開始 (§4)。
  category: columnCategorySchema
    .nullish()
    .transform((v) => v ?? undefined)
    .optional(),
  excerpt: z.string(),
  displayMode: displayModeSelect,
  bodyHtml: optionalStringWithDefault,
  body: optionalStringWithDefault,
  eyecatch: eyecatch
    .nullish()
    .transform((v) => v ?? undefined)
    .optional(),
});
export type ColumnItem = z.infer<typeof columnItemSchema>;

export const columnListSchema = z.object({
  contents: z.array(columnItemSchema),
  totalCount: z.number(),
  offset: z.number(),
  limit: z.number(),
});
export type ColumnList = z.infer<typeof columnListSchema>;
