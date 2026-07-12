import { useTranslations } from "next-intl";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { RESERVE_PATH } from "@/constants/site";
import { isJunePromoActive } from "@/lib/promoSchedule";

export default function PromoBanner() {
  const t = useTranslations("PromoBanner");
  const textKey = isJunePromoActive() ? "textJune" : "text";

  return (
    <TrackedLink
      href={RESERVE_PATH}
      eventKey="reserveEntry"
      location="promo_banner"
      label={t(textKey)}
      aria-label={t("ariaLabel")}
      className="fixed top-0 left-0 w-full z-[55] bg-accent text-deep-black h-[var(--promo-banner-h)] flex items-center justify-center px-4 hover:brightness-95 transition-[filter] duration-200"
    >
      <span className="truncate text-xs md:text-sm font-bold tracking-wide">
        {t(textKey)}
      </span>
    </TrackedLink>
  );
}
