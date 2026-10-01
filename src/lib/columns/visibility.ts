import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { getColumnsList } from "@/lib/microcms/columnsQueries";

type Locale = "ja" | "en";

/**
 * その言語でコラム(一覧・ナビ・sitemap・hreflang)を出すか。
 * 英語は記事が1本も無いうちは出さず、記事が入れば自動で出す。
 */
export async function shouldShowColumns(locale: Locale): Promise<boolean> {
  if (!isCmsColumnsEnabled()) return false;
  if (locale === "ja") return true;
  try {
    const list = await getColumnsList({ locale, limit: 1, offset: 0 });
    return list.totalCount > 0;
  } catch (error) {
    console.error("[shouldShowColumns] microCMS fetch failed:", error);
    return false;
  }
}
