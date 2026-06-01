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

// 内部予約ページのパス（next-intl Link 用）
export const RESERVE_PATH = "/reserve";

// labola 予約カレンダー (shop 3453) の埋め込み URL。
// tab_name=すべて は非ASCIIのため URL エンコード済み。
export const LABOLA_CALENDAR_SRC =
  "https://yoyaku.labola.jp/r/shop/3453/calendar/?embed=normal&tab_name=%E3%81%99%E3%81%B9%E3%81%A6";

export const CAMPFIRE_URL =
  "https://camp-fire.jp/projects/926247/view?utm_campaign=cp_po_share_c_msg_mypage_projects_show";

export const TENNISBEAR_EVENTS_URL =
  "https://www.tennisbear.net/user/148195/organized-event";

export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
