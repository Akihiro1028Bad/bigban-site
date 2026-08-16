import { ArticleJsonLd } from "@/components/ArticleJsonLd";

import type { NewsItem } from "@/lib/microcms/schema";

type Locale = "ja" | "en";

interface NewsArticleJsonLdProps {
  item: NewsItem;
  locale: Locale;
}

/**
 * ニュース詳細用の NewsArticle JSON-LD。
 * 実体は汎用の ArticleJsonLd に委譲する (columns の Article と共通)。
 */
export function NewsArticleJsonLd({ item, locale }: NewsArticleJsonLdProps) {
  return (
    <ArticleJsonLd
      item={item}
      locale={locale}
      schemaType="NewsArticle"
      pathSegment="news"
    />
  );
}
