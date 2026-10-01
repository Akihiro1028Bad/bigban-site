import { useTranslations } from "next-intl";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { PBT_CLUB_PATH } from "@/constants/pbtClub";

export default function PromoBanner() {
  const t = useTranslations("PromoBanner");

  return (
    <TrackedLink
      href={PBT_CLUB_PATH}
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
