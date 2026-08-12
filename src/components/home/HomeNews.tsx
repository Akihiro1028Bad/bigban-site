import { getTranslations } from "next-intl/server";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { NewsCard } from "@/components/news/NewsCard";
import { isCmsNewsEnabled } from "@/config/featureFlags";
import { ABOUT_NEWS_LIMIT } from "@/constants/news";
import { getNewsList } from "@/lib/microcms/queries";
import type { NewsItem } from "@/lib/microcms/schema";

interface HomeNewsProps {
  locale: "ja" | "en";
}

export default async function HomeNews({ locale }: HomeNewsProps) {
  if (!isCmsNewsEnabled()) return null;

  let items: NewsItem[] = [];
  try {
    const list = await getNewsList({
      locale,
      limit: ABOUT_NEWS_LIMIT,
      offset: 0,
    });
    items = list.contents;
  } catch (error) {
    // セクションは静かに非表示にしつつ、Vercel Function logs で原因追跡できるよう
    // サーバーサイドにログを残す。
    console.error("[HomeNews] microCMS fetch failed:", error);
    items = [];
  }

  if (items.length === 0) return null;

  const t = await getTranslations({ locale, namespace: "HomeNews" });

  return (
    <section
      id="news"
      className="bg-deep-black pt-8 lg:pt-16 pb-16 lg:pb-24 text-text-light"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="font-serif text-[clamp(2rem,22vw_-_34.5px,3rem)] leading-none sm:text-6xl lg:text-7xl font-black tracking-[0.15em]">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
          <p className="mt-6 text-sm sm:text-base text-text-gray">
            {t("subtitle")}
          </p>
        </div>

        <ul
          aria-label={t("railLabel")}
          className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-6 px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-3 md:gap-8 md:overflow-visible md:px-0 md:pb-0"
        >
          {items.map((item) => (
            <li
              key={item.id}
              className="w-[82vw] max-w-sm flex-none snap-start md:w-auto md:max-w-none"
            >
              <NewsCard item={item} locale={locale} />
            </li>
          ))}
        </ul>

        <div className="mt-12 lg:mt-16 text-center">
          <TrackedLink
            href="/news"
            eventKey="contentClick"
            location="home_news_view_all"
            label="news"
            className="inline-block bg-accent text-deep-black px-8 py-3 text-xs sm:text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            {t("viewAll")}
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}
