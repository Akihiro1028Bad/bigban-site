import type { FreshnessView } from "@/lib/growth/analyticsView";

interface FreshnessBannerProps { freshness: FreshnessView; }

export function FreshnessBanner({ freshness }: FreshnessBannerProps) {
  if (freshness.level !== "stale") return null;
  return <aside className="analytics-freshness" aria-label="データ鮮度の警告">データが古くなっています（最終同期: {freshness.sourceSyncedYmd}、{freshness.daysOld}日前）。取り込みを実行してください。</aside>;
}
