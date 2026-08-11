import { useTranslations } from "next-intl";
import { TrackedLink } from "@/components/analytics/TrackedLink";

// PBT CLUB 会員制度の告知ニュース記事 (microCMS slug: pbt-club-membership)。
const PBT_CLUB_NEWS_PATH = "/news/pbt-club-membership";

export default function PromoBanner() {
  const t = useTranslations("PromoBanner");

  return (
    <TrackedLink
      href={PBT_CLUB_NEWS_PATH}
      eventKey="contentClick"
      location="promo_banner"
      label={t("textPbtClub")}
      aria-label={t("ariaLabelPbtClub")}
      className="fixed top-0 left-0 w-full z-[55] bg-accent text-deep-black h-[var(--promo-banner-h)] flex items-center justify-center px-4 hover:brightness-95 transition-[filter] duration-200"
    >
      <span className="truncate text-xs md:text-sm font-bold tracking-wide">
        {t("textPbtClub")}
      </span>
    </TrackedLink>
  );
}
