import { SITE_URL } from "@/constants/site";

type Locale = "ja" | "en";

/**
 * JSON-LD 生成に必要な最小フィールドだけを要求する構造的な型。
 * news (NewsItem) / columns (ColumnItem) の双方がこれを満たす。
 */
export interface ArticleJsonLdItem {
  title: string;
  slug: string;
  excerpt: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  eyecatch?: { url: string };
}

interface ArticleJsonLdProps {
  item: ArticleJsonLdItem;
  locale: Locale;
  /** schema.org の型。時事性のある news は NewsArticle、コラムは Article。 */
  schemaType: "Article" | "NewsArticle";
  /** URL のセグメント (例: "news" / "columns")。 */
  pathSegment: string;
}

/**
 * Renders schema.org Article / NewsArticle JSON-LD.
 *
 * The script tag content is produced via JSON.stringify(), which escapes all
 * characters that would otherwise close the script (e.g. quotes, backslashes).
 * For defense-in-depth we additionally replace `<` with the escaped form to
 * neutralize `</script>` injection. No user-supplied raw HTML is rendered —
 * all data is structured fields parsed via Zod (newsItemSchema /
 * columnItemSchema).
 */
export function ArticleJsonLd({
  item,
  locale,
  schemaType,
  pathSegment,
}: ArticleJsonLdProps) {
  const url = `${SITE_URL}${locale === "ja" ? "" : "/en"}/${pathSegment}/${item.slug}`;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    headline: item.title,
    description: item.excerpt,
    datePublished: item.publishedAt ?? item.createdAt,
    dateModified: item.updatedAt,
    inLanguage: locale,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    // author は Article / NewsArticle の必須フィールド。無いと
    // "Missing field 'author'" でリッチリザルト対象外になる。
    // 記事は施設として公開しているため組織を著者にする。個人名での
    // E-E-A-T 強化は執筆者ページ (#430) の整備と合わせて判断する。
    author: {
      "@type": "Organization",
      name: "THE PICKLE BANG THEORY",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "THE PICKLE BANG THEORY",
    },
  };
  if (item.eyecatch) {
    data.image = `${item.eyecatch.url}?w=1200&fm=jpg`;
  }
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
