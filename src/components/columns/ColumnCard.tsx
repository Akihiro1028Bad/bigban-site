import Image from "next/image";
import Link from "next/link";

import {
  columnCategoryColor,
  columnCategoryName,
} from "@/lib/columns/category";
import { COLUMN_CATEGORY_FALLBACK_COLOR } from "@/constants/columns";
import type { ColumnItem } from "@/lib/microcms/columnsSchema";

type Locale = "ja" | "en";

interface ColumnCardProps {
  item: ColumnItem;
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
  return locale === "ja" ? `/columns/${slug}` : `/en/columns/${slug}`;
}

export function ColumnCard({ item, locale }: ColumnCardProps) {
  const category = item.category;
  const placeholderColor = category
    ? columnCategoryColor(category)
    : COLUMN_CATEGORY_FALLBACK_COLOR;
  const dateIso = item.publishedAt ?? item.createdAt;
  const date = formatDate(dateIso);

  return (
    <Link
      href={buildHref(locale, item.slug)}
      className="group block border border-text-gray/10 hover:border-accent/60 transition-colors"
    >
      <div className="relative aspect-[16/9] bg-deep-black overflow-hidden">
        {item.eyecatch ? (
          // 設計判断: alt="" (装飾扱い)。同カード内の <h3> にタイトルがあるため、
          // 画像に alt=title を入れると二重読み上げになる (WCAG H67)。NewsCard と同方針。
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
            data-testid="column-card-placeholder"
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, ${placeholderColor}33 0%, #0A0A0A 100%)`,
            }}
          />
        )}
      </div>
      <div className="p-5 space-y-2">
        <div className="flex items-center gap-3 text-xs text-text-gray">
          {category && (
            <span
              className="inline-block px-2 py-0.5 border"
              style={{
                borderColor: columnCategoryColor(category),
                color: columnCategoryColor(category),
              }}
            >
              {columnCategoryName(category, locale)}
            </span>
          )}
          <time dateTime={date.iso}>{date.display}</time>
        </div>
        <h3 className="text-text-light text-base lg:text-lg font-bold leading-snug line-clamp-2">
          {item.title}
        </h3>
      </div>
    </Link>
  );
}
