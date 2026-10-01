"use client";

import { useTranslations } from "next-intl";
import { EXTERNAL_LINK_PROPS, labolaDayUrl } from "@/constants/site";
import { trackCtaClick, trackLabolaEntry } from "@/lib/analytics/trackEvent";
import { buildQuickDates, toJstDate } from "@/lib/labola/quickDates";
import type { LabolaEntryKind } from "@/lib/analytics/labolaEvents";
import { useMountedNow } from "./useMountedNow";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

interface ReserveCardActionsProps {
  ctaLabel: string;
  /** マウント前・日付指定なしのカードで使う URL。 */
  fallbackHref: string;
  location: string;
  /** 指定があるときだけ labola 専用の流入イベントとビジター注記を伴う。 */
  labolaEntryKind?: LabolaEntryKind;
  /** 指定があるときだけ 1日表示への差し替えと日付ボタンを出す。 */
  tabName?: string;
}

// ボタンは必ず通常の <a href> にする。GA4 のクロスドメインリンカーは <a> の
// クリック時に _gl を付与するため、JS 遷移にすると labola 側で別ユーザーになる。
export default function ReserveCardActions({
  ctaLabel,
  fallbackHref,
  location,
  labolaEntryKind,
  tabName,
}: ReserveCardActionsProps) {
  const t = useTranslations("Reserve.choice");
  const now = useMountedNow();
  const dayView =
    tabName !== undefined && now !== null ? { tabName, now } : null;

  const handleClick = (clickLocation: string) => {
    trackCtaClick("reservation", clickLocation, ctaLabel);
    if (labolaEntryKind) trackLabolaEntry(labolaEntryKind);
  };

  return (
    <>
      <a
        href={
          dayView
            ? labolaDayUrl(dayView.tabName, toJstDate(dayView.now))
            : fallbackHref
        }
        {...EXTERNAL_LINK_PROPS}
        onClick={() => handleClick(location)}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-accent px-6 py-3.5 text-sm font-bold tracking-[0.15em] text-deep-black transition-all hover:gap-3 hover:bg-accent/90 sm:mt-8 sm:py-4"
      >
        {ctaLabel}
        <span aria-hidden className="text-base leading-none">
          →
        </span>
      </a>

      {dayView && (
        <div role="group" aria-label={t("quickDate.heading")} className="mt-4">
          <p className="text-[11px] tracking-[0.15em] text-text-gray">
            {t("quickDate.heading")}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {buildQuickDates(dayView.now).map((date) => (
              <li key={date.id}>
                <a
                  href={labolaDayUrl(dayView.tabName, date)}
                  {...EXTERNAL_LINK_PROPS}
                  onClick={() => handleClick(`${location}_date_${date.id}`)}
                  className="flex w-full items-center justify-center border border-accent/40 px-3 py-2 text-xs font-bold tracking-wide text-text-light transition-colors hover:border-accent hover:text-accent"
                >
                  {t("quickDate.chip", {
                    label: t(`quickDate.${date.id}`),
                    month: date.month,
                    day: date.day,
                    weekday: t(`quickDate.weekday.${WEEKDAY_KEYS[date.weekday]}`),
                  })}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {labolaEntryKind && (
        <p className="mt-3 text-xs leading-relaxed text-text-gray">
          {t("visitorNote")}
        </p>
      )}
    </>
  );
}
