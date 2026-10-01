/** 問い合わせ種別の値。API・フォーム・/about のプリセレクトで共有する単一ソース。 */
export const CONTACT_CATEGORY_VALUES = [
  "court",
  "lesson",
  "private",
  "press",
  "other",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORY_VALUES)[number];

export function isContactCategory(value: unknown): value is ContactCategory {
  return (
    typeof value === "string" &&
    (CONTACT_CATEGORY_VALUES as readonly string[]).includes(value)
  );
}
