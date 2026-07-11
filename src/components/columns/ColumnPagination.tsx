import Link from "next/link";

import { buildPageList } from "@/components/news/NewsPagination";

type Locale = "ja" | "en";

interface ColumnPaginationProps {
  currentPage: number;
  totalPages: number;
  locale: Locale;
  /** column-categories の content ID (絞り込み中のみ)。 */
  category?: string;
}

function buildHref(
  locale: Locale,
  page: number,
  category?: string,
): string {
  const base = locale === "ja" ? "/columns" : "/en/columns";
  const params = new URLSearchParams();
  if (page !== 1) params.set("page", String(page));
  if (category) params.set("category", category);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function ColumnPagination({
  currentPage,
  totalPages,
  locale,
  category,
}: ColumnPaginationProps) {
  if (totalPages <= 1) return null;

  const labels =
    locale === "ja"
      ? { prev: "前のページ", next: "次のページ", aria: "ページネーション" }
      : { prev: "Previous", next: "Next", aria: "Pagination" };

  const pages = buildPageList(currentPage, totalPages);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav aria-label={labels.aria} className="mt-12 flex justify-center gap-2">
      {hasPrev && (
        <Link
          href={buildHref(locale, currentPage - 1, category)}
          rel="prev"
          className="px-4 py-2 border border-accent text-accent text-sm hover:bg-accent hover:text-deep-black transition-colors"
        >
          {labels.prev}
        </Link>
      )}
      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`ellipsis-${i}`}
            aria-hidden="true"
            className="px-2 py-2 text-sm text-text-gray"
          >
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(locale, p, category)}
            aria-current={p === currentPage ? "page" : undefined}
            className={`px-4 py-2 border text-sm transition-colors ${
              p === currentPage
                ? "border-accent bg-accent text-deep-black font-bold"
                : "border-text-gray text-text-light hover:border-accent hover:text-accent"
            }`}
          >
            {p}
          </Link>
        ),
      )}
      {hasNext && (
        <Link
          href={buildHref(locale, currentPage + 1, category)}
          rel="next"
          className="px-4 py-2 border border-accent text-accent text-sm hover:bg-accent hover:text-deep-black transition-colors"
        >
          {labels.next}
        </Link>
      )}
    </nav>
  );
}
