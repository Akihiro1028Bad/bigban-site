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
