/**
 * 成績ボード(#C4 計測ループ)。公開記事の GA4 成績(Notion ミラー)を一覧する。
 * プル型: データは Notion `成績データ` 由来で、ここは表示のみ。
 */

import { type ArticleMetrics, summarizeMetrics } from "@/lib/growth/metrics";

import {
  type DeltaTone,
  formatCount,
  formatCtr,
  formatDelta,
  formatPosition,
} from "./articleMetricsView";

/** 成績ボードが必要とする最小形状(lib/ApproveClient どちらの記事 item でも満たす)。 */
interface MetricsItem {
  id: string;
  title: string;
  metrics?: ArticleMetrics;
}

interface PerformanceBoardProps {
  items: readonly MetricsItem[];
}

const TONE_CLASS: Record<DeltaTone, string> = {
  up: "text-emerald-600",
  down: "text-rose-600",
  flat: "text-gray-500",
  none: "text-gray-400",
};

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  const { text, tone } = formatDelta(deltaPct);
  return <span className={`text-xs font-semibold ${TONE_CLASS[tone]}`}>{text}</span>;
}

export function PerformanceBoard({ items }: PerformanceBoardProps) {
  const measured = items
    .map((item) => (item.metrics ? { item, metrics: item.metrics } : null))
    .filter((x): x is { item: MetricsItem; metrics: ArticleMetrics } => x !== null)
    .sort((a, b) => b.metrics.views.current - a.metrics.views.current);

  const summary = summarizeMetrics(items.map((item) => ({ title: item.title, metrics: item.metrics })));

  return (
    <section aria-label="成績ボード" className="rounded-lg ring-1 ring-gray-200 bg-white p-4">
      <h2 className="text-sm font-bold text-gray-900">成績ボード</h2>

      {summary.count === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          まだ計測データがありません。公開記事の成績は計測ループ更新後に表示されます。
        </p>
      ) : (
        <>
          <dl className="mt-3 flex flex-wrap gap-4">
            <div>
              <dt className="text-[11px] text-gray-500">合計表示数</dt>
              <dd className="text-base font-semibold text-gray-900">{formatCount(summary.totalViews)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-gray-500">合計ユーザー数</dt>
              <dd className="text-base font-semibold text-gray-900">{formatCount(summary.totalUsers)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-gray-500">計測記事数</dt>
              <dd className="text-base font-semibold text-gray-900">{summary.count}</dd>
            </div>
          </dl>

          <ul className="mt-3 divide-y divide-gray-100">
            {measured.map(({ item, metrics }) => (
              <li key={item.id} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{item.title}</span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="font-semibold text-gray-900">{formatCount(metrics.views.current)}</span>
                    表示
                    <DeltaBadge deltaPct={metrics.views.deltaPct} />
                  </span>
                  <span className="text-xs text-gray-600">
                    <span className="font-semibold text-gray-900">{formatCount(metrics.users.current)}</span>
                    {" "}ユーザー
                  </span>
                </div>
                {/* #計測強化 S2: GSC 検索成績(あれば)。クリック/CTR/順位＋上位クエリ。 */}
                {metrics.search ? (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1">
                      🔍
                      <span className="font-semibold text-gray-700">
                        {formatCount(metrics.search.clicks.current)}
                      </span>
                      クリック
                      <DeltaBadge deltaPct={metrics.search.clicks.deltaPct} />
                    </span>
                    <span>表示 {formatCount(metrics.search.impressions.current)}</span>
                    <span>CTR {formatCtr(metrics.search.ctr.current)}</span>
                    <span>順位 {formatPosition(metrics.search.position.current)}</span>
                    {metrics.keyEvents ? (
                      <span>
                        CTA{" "}
                        <span className="font-semibold text-gray-700">
                          {formatCount(metrics.keyEvents.current)}
                        </span>
                      </span>
                    ) : null}
                    {metrics.search.topQueries[0] ? (
                      <span className="min-w-0 max-w-[14rem] truncate text-gray-400">
                        「{metrics.search.topQueries[0].query}」
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
