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

// /reserve（予約案内ページ）は labola 予約導線の開放に伴い sitemap に含める。
export const SITEMAP_ROUTES: readonly RouteConfig[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/reserve", priority: 0.9, changeFrequency: "weekly" },
  { path: "/hyrox", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tokushoho", priority: 0.2, changeFrequency: "yearly" },
] as const;
