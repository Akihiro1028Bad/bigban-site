export type ChangeFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface RouteConfig {
  path: string;
  priority: number;
  changeFrequency: ChangeFrequency;
}

// 予約ページ /reserve は labola 設定完了までの暫定で sitemap から除外している。
// 導線を復活する際は { path: "/reserve", priority: 0.9, changeFrequency: "weekly" } を戻す。
export const SITEMAP_ROUTES: readonly RouteConfig[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/hyrox", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tokushoho", priority: 0.2, changeFrequency: "yearly" },
] as const;
