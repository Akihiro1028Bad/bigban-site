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

// labola 予約 URL を組み立てる。tabName は labola 管理画面のカテゴリ名と完全一致。
const LABOLA_SHOP_BASE = "https://yoyaku.labola.jp/r/shop/3473";
// 週表示ビュー（日付なし＝閲覧時点の週を初期表示）。
// 週を固定すると時間経過で過去の週が開いてしまうため、日付セグメントは持たせない。
// labola が日付未指定時に生成する形式（?& 区切り）をそのまま採用。
function labolaCurrentWeekUrl(tabName: string): string {
  return `${LABOLA_SHOP_BASE}/calendar_week/?&tab_name=${encodeURIComponent(tabName)}`;
}

// ピックルボールコートのご予約（labola・ピックルタブ）。
export const LABOLA_PICKLEBALL_URL =
  labolaCurrentWeekUrl("ピックルボールコート");

// HYROX のご予約（labola・HYROX タブ）。
export const LABOLA_HYROX_URL = labolaCurrentWeekUrl("H Y R O X");

// レッスン / クラスのご予約（labola・スクール予約）。
// コート/HYROX の calendar_week（枠貸し）とは別系統の event/school パス。
export const LABOLA_SCHOOL_URL =
  "https://yoyaku.labola.jp/r/shop/3473/event/school/";

// labola 店舗トップ。予約導線ではなく、構造化データ (sameAs) で
// 施設の同一性を示す外部プロフィールとして参照する。
export const LABOLA_SHOP_URL = `${LABOLA_SHOP_BASE}/`;

// 内部予約案内ページのパス（next-intl Link 用）。予約カテゴリごとの labola 導線を案内する。
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

// 表示用のアカウント名（@付き）。URL と対で持ち、表記ゆれを防ぐ。
export const INSTAGRAM_HANDLE = "@thepicklebangtheory";

export const COACH_INSTAGRAM_URL = "https://www.instagram.com/tac_monk/";

// Google ビジネスプロフィール。表示リンク (HomeAccess / TeaserContent) と
// 構造化データの sameAs で同一の値を参照し、掲載情報の変更時に片方だけ
// 古くなるのを防ぐ。
export const GOOGLE_BUSINESS_PROFILE_URL =
  "https://maps.app.goo.gl/Hjm2wMkZ6SXVoJKq7";

// 施設が主催するテニスベアサークルのプロフィール。構造化データ (sameAs) で
// 施設の同一性を示す外部プロフィールとして参照する。
export const TENNISBEAR_CIRCLE_URL =
  "https://www.tennisbear.net/pickleball/circle/36659";

// 主催イベント（早朝ピックルボール等）の申込先。
// 主催者ユーザーページ (/user/148195/organized-event) ではなくサークルページを使う。
// 施設名がページタイトルになり公式サイトからの遷移として自然で、
// かつ参加者数（例 14人/16人）が表示され参加検討の材料になるため。
// 転換率都合で貼り替わり得るため、sameAs は TENNISBEAR_CIRCLE_URL を使う。
export const TENNISBEAR_EVENTS_URL = `${TENNISBEAR_CIRCLE_URL}/events`;

export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
