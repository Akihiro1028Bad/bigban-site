"use client";

import { useRouter } from "next/navigation";

import {
  columnCategoryColor,
  columnCategoryName,
} from "@/lib/columns/category";
import type { ColumnCategory } from "@/lib/microcms/columnsSchema";

type Locale = "ja" | "en";

interface ColumnCategoryTabsProps {
  locale: Locale;
  /** column-categories マスタ (order 昇順)。動的生成 (固定配列にしない・§5.1)。 */
  categories: readonly ColumnCategory[];
  /** 選択中カテゴリの content ID。未選択は undefined (= すべて)。 */
  activeCategory: string | undefined;
}

function basePath(locale: Locale): string {
  return locale === "ja" ? "/columns" : "/en/columns";
}

function allLabel(locale: Locale): string {
  return locale === "ja" ? "すべて" : "All";
}

export function ColumnCategoryTabs({
  locale,
  categories,
  activeCategory,
}: ColumnCategoryTabsProps) {
  const router = useRouter();

  // カテゴリが無ければタブ自体を出さない (All 単独も無意味)。
  if (categories.length === 0) return null;

  function handleClick(id: string | null) {
    if (id === null) router.push(basePath(locale));
    else router.push(`${basePath(locale)}?category=${id}`);
  }

  const allActive = activeCategory === undefined;

  return (
    <div className="flex flex-wrap gap-2 mb-8">
      <button
        type="button"
        aria-pressed={allActive}
        onClick={() => handleClick(null)}
        className={`px-4 py-1.5 text-xs tracking-wider border transition-colors ${
          allActive
            ? "border-accent text-accent"
            : "border-text-gray/40 text-text-gray hover:border-text-light/60"
        }`}
      >
        {allLabel(locale)}
      </button>
      {categories.map((c) => {
        const active = activeCategory === c.id;
        const color = columnCategoryColor(c);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={active}
            onClick={() => handleClick(c.id)}
            style={active ? { borderColor: color, color } : undefined}
            className={`px-4 py-1.5 text-xs tracking-wider border transition-colors ${
              active
                ? ""
                : "border-text-gray/40 text-text-gray hover:border-text-light/60"
            }`}
          >
            {columnCategoryName(c, locale)}
          </button>
        );
      })}
    </div>
  );
}
