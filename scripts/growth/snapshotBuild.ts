/** 正準データから集計・検出を接続して検証済みスナップショットを作る。 */
import { cancellationStats, demandHeatmap, leadTimeStats, wardCounts, weeklyKpis, weeklyReservationSeries } from "./reservationAggregates";
import { CORE_DETECTORS, runDetectors } from "./insightEngine";
import { snapshotSchema } from "./snapshotSchema";
import type { CanonicalBundle } from "./labolaNormalize";
import type { DateRange } from "./period";
import type { Snapshot } from "./snapshotSchema";

function inputsOf(bundle: CanonicalBundle): { type: string; rows: number }[] {
  return Object.entries(bundle.meta.counts).map(([type, rows]) => ({ type, rows }));
}

export function buildSnapshot(input: { bundle: CanonicalBundle; current: DateRange; prior: DateRange; todayYmd: string; previousSnapshot: Snapshot | null }): Snapshot {
  const { bundle, current, prior, todayYmd, previousSnapshot } = input;
  return snapshotSchema.parse({
    schemaVersion: 1,
    generatedAt: bundle.meta.generatedAt,
    coverage: bundle.meta.coverage,
    meta: { inputs: inputsOf(bundle), excludedCount: bundle.meta.excludedCount, missingSections: bundle.meta.missingSections, warnings: bundle.meta.warnings },
    kpi: weeklyKpis(bundle, current, prior, todayYmd),
    catalog: { heatmap: demandHeatmap(bundle, todayYmd), leadTime: leadTimeStats(bundle, todayYmd), cancellation: cancellationStats(bundle, todayYmd), wards: wardCounts(bundle) },
    series: { weeklyReservations: weeklyReservationSeries(bundle) },
    insights: runDetectors({ bundle, current, prior, todayYmd, previousSnapshot }, CORE_DETECTORS),
  });
}
