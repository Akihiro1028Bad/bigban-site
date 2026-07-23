import { getTranslations } from "next-intl/server";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { ColumnCard } from "@/components/columns/ColumnCard";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import { getColumnsList } from "@/lib/microcms/columnsQueries";
import type { ColumnItem } from "@/lib/microcms/columnsSchema";

interface HomeColumnsProps {
  locale: "ja" | "en";
}

const HOME_COLUMNS_LIMIT = 3;

export default async function HomeColumns({ locale }: HomeColumnsProps) {
  if (!isCmsColumnsEnabled()) return null;

  let items: ColumnItem[] = [];
  try {
    const list = await getColumnsList({
      locale,
      limit: HOME_COLUMNS_LIMIT,
      offset: 0,
    });
    items = list.contents;
  } catch (error) {
    console.error("[HomeColumns] microCMS fetch failed:", error);
    items = [];
  }

  if (items.length === 0) return null;

  const t = await getTranslations({ locale, namespace: "HomeColumns" });

  return (
    <section
      id="columns"
      className="bg-deep-black pt-8 lg:pt-16 pb-16 lg:pb-32 text-text-light"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-black tracking-[0.15em]">
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
              <ColumnCard
                item={item}
                locale={locale}
                trackingLocation="home_column_card"
              />
            </li>
          ))}
        </ul>

        <div className="mt-12 lg:mt-16 text-center">
          <TrackedLink
            href="/columns"
            eventKey="contentClick"
            location="home_columns_view_all"
            label="columns"
            className="inline-block bg-accent text-deep-black px-8 py-3 text-xs sm:text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            {t("viewAll")}
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}
