// グローバルナビゲーション項目（ヘッダー・モバイルメニュー・フッターで共有）。
// kind: "anchor" はトップページ内アンカー、"page" は独立ページ遷移。
export const NAV_ITEMS = [
  { id: "concept", kind: "anchor", href: "/#concept" },
  { id: "facility", kind: "anchor", href: "/#facility" },
  { id: "services", kind: "anchor", href: "/#services" },
  { id: "hyrox", kind: "page", href: "/hyrox" },
  { id: "pricing", kind: "anchor", href: "/#pricing" },
  { id: "news", kind: "page", href: "/news" },
  { id: "about", kind: "page", href: "/about" },
  { id: "access", kind: "anchor", href: "/#access" },
] as const;

export interface NavItem {
  id: string;
  kind: "anchor" | "page";
  href: string;
}

/** COLUMN リンク(コラム分離 P1⑦)。USE_CMS_COLUMNS 有効時のみ NEWS の直後に挿入する。 */
const COLUMNS_NAV_ITEM: NavItem = { id: "columns", kind: "page", href: "/columns" };

/**
 * NEWS の直後に COLUMN リンクを差し込んだ配列を返す(showColumns 有効時のみ)。
 * 既定(false)は現行の 8 項目のまま = USE_CMS_COLUMNS 未有効デプロイと整合。
 * ヘッダー・モバイルメニュー・フッターで同じ並びを使うため、ここで一元化する。
 */
export function navItemsFor(showColumns: boolean): readonly NavItem[] {
  if (!showColumns) return NAV_ITEMS;
  const newsIdx = NAV_ITEMS.findIndex((item) => item.id === "news");
  return [
    ...NAV_ITEMS.slice(0, newsIdx + 1),
    COLUMNS_NAV_ITEM,
    ...NAV_ITEMS.slice(newsIdx + 1),
  ];
}

// トップページ内アンカー項目の ID 一覧（スクロール監視対象）。
// NAV_ITEMS から anchor のみを自動抽出し、定義の二重管理を防ぐ。
export const SECTION_IDS: readonly string[] = NAV_ITEMS.filter(
  (item) => item.kind === "anchor",
).map((item) => item.id);
