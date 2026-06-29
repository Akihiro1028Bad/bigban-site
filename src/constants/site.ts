export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/**
 * SNS 共有用 OGP 画像 (全ページ共通の単一ロゴ画像)。
 * 実体は src/app/opengraph-image.png で `/opengraph-image.png` として配信される。
 */
export const OG_IMAGE = {
  url: `${SITE_URL}/opengraph-image.png`,
  width: 1200,
  height: 630,
  alt: "THE PICKLE BANG THEORY",
} as const;

// 7月までのご予約（現行 RESERVA）。2026年8月のご利用分から labola へ移行する。
export const RESERVE_URL = "https://reserva.be/tpbt";

// labola 予約 URL を組み立てる。tabName は labola 管理画面のカテゴリ名と完全一致。
const LABOLA_SHOP_BASE = "https://yoyaku.labola.jp/r/shop/3473";
// 週指定ビュー（weekStartPath 例 "2026/7/27" の週を初期表示）。
function labolaWeekUrl(weekStartPath: string, tabName: string): string {
  return `${LABOLA_SHOP_BASE}/calendar_week/${weekStartPath}/?tab_name=${encodeURIComponent(tabName)}`;
}
// ピックルボールコートの8月以降のご予約（labola・ピックルタブ・7/27 週=8/1 を含む週）。
export const LABOLA_PICKLEBALL_URL = labolaWeekUrl(
  "2026/7/27",
  "ピックルボールコート",
);

// HYROX のご予約（labola・HYROX タブ・日付なし＝現在の週を表示）。
// labola が日付未指定時に生成する形式（?& 区切り）をそのまま採用。
export const LABOLA_HYROX_URL =
  "https://yoyaku.labola.jp/r/shop/3473/calendar_week/?&tab_name=H%20Y%20R%20O%20X";

// 内部予約案内ページのパス（next-intl Link 用）。7月=RESERVA / 8月以降=labola の二択を案内する。
export const RESERVE_PATH = "/reserve";

// labola 予約カレンダー (shop 3473, 一日表示) の埋め込みベース URL。
export const LABOLA_CALENDAR_BASE =
  "https://yoyaku.labola.jp/r/shop/3473/calendar/?embed=normal";

// 予約カテゴリのタブ。tabName は labola 管理画面の登録カテゴリ名と完全一致が必須。
// HYROX は半角スペース入り ("H Y R O X") が登録名。
export const LABOLA_CALENDAR_TABS = [
  { key: "pickleball", tabName: "ピックルボールコート" },
  { key: "hyrox", tabName: "H Y R O X" },
] as const;

export type LabolaCalendarTabKey = (typeof LABOLA_CALENDAR_TABS)[number]["key"];

// カテゴリ名を URL エンコードして埋め込み URL を組み立てる。
// 例: "H Y R O X" → ...&tab_name=H%20Y%20R%20O%20X
export function buildLabolaCalendarSrc(tabName: string): string {
  return `${LABOLA_CALENDAR_BASE}&tab_name=${encodeURIComponent(tabName)}`;
}

// 予約ページへのリンク（初期タブ指定つき）。例: /reserve?tab=hyrox
export function reserveHref(tab: LabolaCalendarTabKey): string {
  return `${RESERVE_PATH}?tab=${tab}`;
}

// クエリ等の外部入力を検証し、有効なタブキーへ正規化する。
// 不正値・未指定・配列は先頭タブ（ピックルボールコート）にフォールバック。
export function resolveCalendarTabKey(
  value: string | string[] | undefined,
): LabolaCalendarTabKey {
  return LABOLA_CALENDAR_TABS.find((tab) => tab.key === value)?.key
    ?? LABOLA_CALENDAR_TABS[0].key;
}

export const INSTAGRAM_URL = "https://www.instagram.com/thepicklebangtheory";

export const COACH_INSTAGRAM_URL = "https://www.instagram.com/tac_monk/";

export const CAMPFIRE_URL =
  "https://camp-fire.jp/projects/926247/view?utm_campaign=cp_po_share_c_msg_mypage_projects_show";

export const TENNISBEAR_EVENTS_URL =
  "https://www.tennisbear.net/user/148195/organized-event";

export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
