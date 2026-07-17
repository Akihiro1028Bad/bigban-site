/** 正準データから集計・検出を接続して検証済みスナップショットを作る。 */
import { cancellationStats, demographics, demandHeatmap, leadTimeStats, paymentMethodShare, programFills, revPach, unpaidAging, wardCounts, weeklyKpis, weeklyReservationSeries } from "./reservationAggregates";
import { CORE_DETECTORS, runDetectors } from "./insightEngine";
import { computeWeeklyPeriods } from "./period";
import { snapshotSchema } from "./snapshotSchema";
import type { CanonicalBundle } from "./labolaNormalize";
import type { DateRange } from "./period";
import type { Snapshot } from "./snapshotSchema";

function inputsOf(bundle: CanonicalBundle): { type: string; rows: number }[] {
  return Object.entries(bundle.meta.counts).map(([type, rows]) => ({ type, rows }));
}

export function buildSnapshot(input: { bundle: CanonicalBundle; coverage: CanonicalBundle["meta"]["coverage"]; sourceSyncedAt: string; current: DateRange; prior: DateRange; todayYmd: string; previousSnapshot: Snapshot | null; baselineInputs: Snapshot["meta"]["inputs"] | null }): Snapshot {
  const { bundle, coverage, sourceSyncedAt, todayYmd, previousSnapshot, baselineInputs } = input;
  const referenceYmd = todayYmd <= coverage.end ? todayYmd : coverage.end;
  // 完了週は収録最終日を基準に確定する。これにより古いCSVの未収録期間を分析しない。
  const { current, prior } = computeWeeklyPeriods(new Date(`${referenceYmd}T12:00:00+09:00`));
  return snapshotSchema.parse({
    schemaVersion: 1,
    generatedAt: bundle.meta.generatedAt,
    coverage,
    analysis: { referenceYmd, currentWeek: current },
    meta: { sourceSyncedAt, inputs: inputsOf(bundle), excludedCount: bundle.meta.excludedCount, missingSections: bundle.meta.missingSections, warnings: bundle.meta.warnings },
    kpi: weeklyKpis(bundle, current, prior, referenceYmd),
    catalog: { heatmap: demandHeatmap(bundle, referenceYmd), leadTime: leadTimeStats(bundle, referenceYmd), cancellation: cancellationStats(bundle, referenceYmd), wards: wardCounts(bundle), programFills: bundle.meta.missingSections.includes("program") ? undefined : programFills(bundle, referenceYmd), unpaidAging: unpaidAging(bundle, referenceYmd), paymentMethods: paymentMethodShare(bundle, referenceYmd), demographics: demographics(bundle), revPach: bundle.meta.missingSections.includes("blocked") ? undefined : revPach(bundle, referenceYmd) },
    series: { weeklyReservations: weeklyReservationSeries(bundle) },
    insights: runDetectors({ bundle, current, prior, todayYmd: referenceYmd, previousSnapshot, baselineInputs }, CORE_DETECTORS),
  });
}
