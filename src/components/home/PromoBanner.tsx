import { useTranslations } from "next-intl";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { RESERVE_PATH } from "@/constants/site";
import { getPromoBannerPhase } from "@/lib/promoSchedule";

import type { CtaKey } from "@/lib/analytics/events";
import type { PromoBannerPhase } from "@/lib/promoSchedule";

// PBT CLUB 会員制度の告知ニュース記事 (microCMS slug: pbt-club-membership)。
const PBT_CLUB_NEWS_PATH = "/news/pbt-club-membership";

// フェーズごとの表示文言・読み上げラベル・遷移先。
// 8/1 以降は失効した CAMPFIRE30 を出さず、PBT CLUB 会員制度の訴求へ切り替え、
// 遷移先も予約ページではなく制度を説明するニュース記事にする。
const PHASE_CONFIG: Record<
  PromoBannerPhase,
  { text: string; ariaLabel: string; href: string; eventKey: CtaKey }
> = {
  may: {
    text: "text",
    ariaLabel: "ariaLabel",
    href: RESERVE_PATH,
    eventKey: "reserveEntry",
  },
  june: {
    text: "textJune",
    ariaLabel: "ariaLabel",
    href: RESERVE_PATH,
    eventKey: "reserveEntry",
  },
  pbtClub: {
    text: "textPbtClub",
    ariaLabel: "ariaLabelPbtClub",
    href: PBT_CLUB_NEWS_PATH,
    eventKey: "contentClick",
  },
};

export default function PromoBanner() {
  const t = useTranslations("PromoBanner");
  const {
    text: textKey,
    ariaLabel: ariaLabelKey,
    href,
    eventKey,
  } = PHASE_CONFIG[getPromoBannerPhase()];

  return (
    <TrackedLink
      href={href}
      eventKey={eventKey}
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
