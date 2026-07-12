import Image from "next/image";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { resolveCategories } from "@/lib/news/categories";
import type { NewsItem } from "@/lib/microcms/schema";

type Locale = "ja" | "en";

interface NewsCardProps {
  item: NewsItem;
  locale: Locale;
}

function formatDate(iso: string): { display: string; iso: string } {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return { display: `${yyyy}.${mm}.${dd}`, iso: `${yyyy}-${mm}-${dd}` };
}

function buildHref(locale: Locale, slug: string): string {
  return locale === "ja" ? `/news/${slug}` : `/en/news/${slug}`;
}

export function NewsCard({ item, locale }: NewsCardProps) {
  const cats = resolveCategories(item.category);
  // プレースホルダー画像のグラデは先頭カテゴリ色のみ使用 (混色を避ける設計判断)
  const placeholderColor = cats[0]?.color ?? "#8A8A8A";
  const dateIso = item.publishedAt ?? item.createdAt;
  const date = formatDate(dateIso);

  return (
    <TrackedLink
      href={buildHref(locale, item.slug)}
      eventKey="contentClick"
      location="news_card"
      label={item.slug}
      className="group block border border-text-gray/10 hover:border-accent/60 transition-colors"
    >
      <div className="relative aspect-[16/9] bg-deep-black overflow-hidden">
        {item.eyecatch ? (
          // 設計判断: alt="" (装飾扱い)。
          // 同カード内の <h3> に記事タイトルがあるため、画像にも alt=item.title
          // を入れるとスクリーンリーダで二重読み上げになる (WCAG H67)。
          // a11y 観点では装飾扱いで二重読み上げを避ける方が望ましい。
          <Image
            src={`${item.eyecatch.url}?w=600&fm=webp&q=75`}
            alt=""
            width={600}
            height={Math.round(
              (item.eyecatch.height / item.eyecatch.width) * 600,
            )}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            data-testid="news-card-placeholder"
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, ${placeholderColor}33 0%, #0A0A0A 100%)`,
            }}
          />
        )}
      </div>
      <div className="p-5 space-y-2">
        <div className="flex items-center gap-3 text-xs text-text-gray">
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {cats.map((c) => (
                <span
                  key={c.id}
                  className="inline-block px-2 py-0.5 border"
                  style={{ borderColor: c.color, color: c.color }}
                >
                  {locale === "ja" ? c.labelJa : c.labelEn}
                </span>
              ))}
            </div>
          )}
          <time dateTime={date.iso}>{date.display}</time>
        </div>
        <h3 className="text-text-light text-base lg:text-lg font-bold leading-snug line-clamp-2">
          {item.title}
        </h3>
      </div>
    </TrackedLink>
  );
}
