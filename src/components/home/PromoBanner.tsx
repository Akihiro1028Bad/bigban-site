import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RESERVE_PATH } from "@/constants/site";
import { isJunePromoActive } from "@/lib/promoSchedule";

export default function PromoBanner() {
  const t = useTranslations("PromoBanner");
  const textKey = isJunePromoActive() ? "textJune" : "text";

  return (
    <Link
      href={RESERVE_PATH}
      aria-label={t("ariaLabel")}
      className="fixed top-0 left-0 w-full z-[55] bg-accent text-deep-black h-[var(--promo-banner-h)] flex items-center justify-center px-4 hover:brightness-95 transition-[filter] duration-200"
    >
      <span className="truncate text-xs md:text-sm font-bold tracking-wide">
        {t(textKey)}
      </span>
    </Link>
  );
}
