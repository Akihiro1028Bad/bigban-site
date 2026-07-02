import { COLUMN_CATEGORY_FALLBACK_COLOR } from "@/constants/columns";
import type { ColumnCategory } from "@/lib/microcms/columnsSchema";

type Locale = "ja" | "en";

/**
 * カテゴリの表示名を locale に応じて解決する。
 * en で nameEn 未設定なら name にフォールバックする(欠落耐性・§4.1)。
 */
export function columnCategoryName(
  category: ColumnCategory,
  locale: Locale,
): string {
  if (locale === "en") return category.nameEn ?? category.name;
  return category.name;
}

/**
 * カテゴリのチップ色を解決する。color 未設定はフロント既定トーン(AD9・§4.1)。
 */
export function columnCategoryColor(category: ColumnCategory): string {
  return category.color ?? COLUMN_CATEGORY_FALLBACK_COLOR;
}
