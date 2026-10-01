type Locale = "ja" | "en";

export interface EndedLabels {
  badge: string;
  message: string;
  newsLabel: string;
  reserveLabel: string;
  separator: string;
  suffix: string;
  newsHref: string;
  reserveHref: string;
}

const LABELS: Record<Locale, EndedLabels> = {
  ja: {
    badge: "終了",
    message: "このイベントは終了しました。最新の開催情報は",
    newsLabel: "ニュース一覧",
    reserveLabel: "予約ページ",
    separator: "・",
    suffix: "をご確認ください。",
    newsHref: "/news",
    reserveHref: "/reserve",
  },
  en: {
    badge: "Ended",
    message: "This event has ended. Check the latest information on the ",
    newsLabel: "News",
    reserveLabel: "Reserve",
    separator: " or ",
    suffix: " page.",
    newsHref: "/en/news",
    reserveHref: "/en/reserve",
  },
};

/** 「終了」表示まわりの文言。詳細ページの既存流儀(ロケール分岐)に合わせて集約する。 */
export function getEndedLabels(locale: Locale): EndedLabels {
  return LABELS[locale];
}
