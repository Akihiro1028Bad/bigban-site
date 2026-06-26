import { useTranslations } from "next-intl";
import { RESERVE_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";
import { isJunePromoActive } from "@/lib/promoSchedule";

export default function PromoBanner() {
  const t = useTranslations("PromoBanner");
  const textKey = isJunePromoActive() ? "textJune" : "text";

  return (
    <a
      href={RESERVE_URL}
      {...EXTERNAL_LINK_PROPS}
      aria-label={t("ariaLabel")}
      className="fixed top-0 left-0 w-full z-[55] bg-accent text-deep-black h-[var(--promo-banner-h)] flex items-center justify-center px-4 hover:brightness-95 transition-[filter] duration-200"
    >
      <span className="truncate text-xs md:text-sm font-bold tracking-wide">
        {t(textKey)}
      </span>
    </a>
  );
}
