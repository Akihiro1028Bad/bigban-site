/** Notion API のプロパティ値の組み立てと読み取り。 */
import { z } from "zod";

export interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
}

const RICH_TEXT_LIMIT = 2000;

export function chunkText(text: string, size = RICH_TEXT_LIMIT): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) chunks.push(text.slice(index, index + size));
  return chunks;
}

function richText(text: string) {
  return chunkText(text).map((content) => ({ type: "text", text: { content } }));
}

export const prop = {
  title: (text: string) => ({ title: richText(text) }),
  text: (text: string | null) => ({ rich_text: text ? richText(text) : [] }),
  number: (value: number | null) => ({ number: value }),
  date: (value: string | null) => ({ date: value ? { start: value } : null }),
  select: (name: string | null) => ({ select: name ? { name } : null }),
  multiSelect: (names: readonly string[]) => ({ multi_select: names.map((name) => ({ name })) }),
  checkbox: (value: boolean) => ({ checkbox: value }),
  relation: (ids: readonly string[]) => ({ relation: ids.map((id) => ({ id })) }),
};

const plainTextSchema = z.array(z.object({ plain_text: z.string() }));
const textPropSchema = z.union([
  z.object({ title: plainTextSchema }).transform((v) => v.title),
  z.object({ rich_text: plainTextSchema }).transform((v) => v.rich_text),
]);
const numberPropSchema = z.object({ number: z.number().nullable() });
const selectPropSchema = z.object({ select: z.object({ name: z.string() }).nullable() });
const multiSelectPropSchema = z.object({ multi_select: z.array(z.object({ name: z.string() })) });
const datePropSchema = z.object({ date: z.object({ start: z.string() }).nullable() });

export function readPlainText(page: NotionPage, name: string): string {
  const parsed = textPropSchema.safeParse(page.properties[name]);
  return parsed.success ? parsed.data.map((part) => part.plain_text).join("") : "";
}

export function readNumber(page: NotionPage, name: string): number | null {
  const parsed = numberPropSchema.safeParse(page.properties[name]);
  return parsed.success ? parsed.data.number : null;
}

export function readSelect(page: NotionPage, name: string): string | null {
  const parsed = selectPropSchema.safeParse(page.properties[name]);
  return parsed.success ? (parsed.data.select?.name ?? null) : null;
}

export function readMultiSelect(page: NotionPage, name: string): string[] {
  const parsed = multiSelectPropSchema.safeParse(page.properties[name]);
  return parsed.success ? parsed.data.multi_select.map((option) => option.name) : [];
}

export function readDate(page: NotionPage, name: string): string | null {
  const parsed = datePropSchema.safeParse(page.properties[name]);
  return parsed.success ? (parsed.data.date?.start ?? null) : null;
}
