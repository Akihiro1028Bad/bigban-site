import { getTranslations } from "next-intl/server";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { isCmsNewsEnabled } from "@/config/featureFlags";
import { ABOUT_NEWS_LIMIT } from "@/constants/news";
import { getNewsList } from "@/lib/microcms/queries";

import type { NewsItem } from "@/lib/microcms/schema";

type Locale = "ja" | "en";

interface HomeLatestNewsProps {
  locale: Locale;
}

const LATEST_NEWS_LIMIT = 2;

function formatDate(iso: string): { display: string; iso: string } {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return {
    display: `${year}.${month}.${day}`,
    iso: `${year}-${month}-${day}`,
  };
}

function buildHref(slug: string): string {
  return `/news/${slug}`;
}

export default async function HomeLatestNews({
  locale,
}: HomeLatestNewsProps) {
  if (!isCmsNewsEnabled()) return null;

  let items: NewsItem[] = [];
  try {
    const list = await getNewsList({
      locale,
      limit: ABOUT_NEWS_LIMIT,
      offset: 0,
    });
    items = list.contents.slice(0, LATEST_NEWS_LIMIT);
  } catch (error) {
    console.error("[HomeLatestNews] microCMS fetch failed:", error);
  }

  if (items.length === 0) return null;

  const t = await getTranslations({ locale, namespace: "HomeLatestNews" });

  return (
    <section
      aria-labelledby="home-latest-news-title"
      className="border-y border-text-gray/20 bg-deep-black text-text-light"
    >
      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-12 lg:py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2
              id="home-latest-news-title"
              className="font-serif text-base font-black tracking-[0.12em] sm:text-lg"
            >
              {t("title")}
            </h2>
            <p className="mt-1 text-[9px] font-bold tracking-[0.2em] text-text-gray sm:text-[10px]">
              {t("titleEn")}
            </p>
          </div>
          <TrackedLink
            href="/news"
            eventKey="contentClick"
            location="home_latest_news_view_all"
            label="news"
            className="shrink-0 text-[10px] font-bold tracking-[0.12em] text-text-gray transition-colors hover:text-accent sm:text-xs"
          >
            {t("viewAll")}
          </TrackedLink>
        </div>

        <ul
          aria-label={t("listLabel")}
          className="mt-4 divide-y divide-text-gray/20 border-t border-text-gray/20"
        >
          {items.map((item) => {
            const date = formatDate(item.publishedAt ?? item.createdAt);

            return (
              <li key={item.id}>
                <TrackedLink
                  href={buildHref(item.slug)}
                  eventKey="contentClick"
                  location="home_latest_news"
                  label={item.slug}
                  className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-4 sm:gap-6"
                >
                  <time
                    dateTime={date.iso}
                    className="text-[10px] tracking-wider text-text-gray sm:text-xs"
                  >
                    {date.display}
                  </time>
                  <span className="line-clamp-2 text-xs font-bold leading-relaxed transition-colors group-hover:text-accent sm:line-clamp-1 sm:text-sm">
                    {item.title}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-sm text-accent transition-transform group-hover:translate-x-1"
                  >
                    →
                  </span>
                </TrackedLink>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
