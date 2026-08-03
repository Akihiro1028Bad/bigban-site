import { useTranslations } from "next-intl";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { RESERVE_PATH } from "@/constants/site";
import { getPromoBannerPhase } from "@/lib/promoSchedule";

import type { PromoBannerPhase } from "@/lib/promoSchedule";

// フェーズごとの表示文言と読み上げラベル。
// 8/1 以降は失効した CAMPFIRE30 を出さず、PBT CLUB 会員制度の訴求へ切り替える。
const MESSAGE_KEYS: Record<
  PromoBannerPhase,
  { text: string; ariaLabel: string }
> = {
  may: { text: "text", ariaLabel: "ariaLabel" },
  june: { text: "textJune", ariaLabel: "ariaLabel" },
  pbtClub: { text: "textPbtClub", ariaLabel: "ariaLabelPbtClub" },
};

export default function PromoBanner() {
  const t = useTranslations("PromoBanner");
  const { text: textKey, ariaLabel: ariaLabelKey } =
    MESSAGE_KEYS[getPromoBannerPhase()];

  return (
    <TrackedLink
      href={RESERVE_PATH}
      eventKey="reserveEntry"
      location="promo_banner"
      label={t(textKey)}
      aria-label={t(ariaLabelKey)}
      className="fixed top-0 left-0 w-full z-[55] bg-accent text-deep-black h-[var(--promo-banner-h)] flex items-center justify-center px-4 hover:brightness-95 transition-[filter] duration-200"
    >
      <span className="truncate text-xs md:text-sm font-bold tracking-wide">
        {t(textKey)}
      </span>
    </TrackedLink>
  );
}
