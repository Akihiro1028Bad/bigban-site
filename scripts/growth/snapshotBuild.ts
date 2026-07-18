/** 正準データから集計・検出を接続して検証済みスナップショットを作る。 */
import { cancellationStats, demographics, demandHeatmap, leadTimeStats, paymentMethodShare, programFills, revPach, selfBookedInWeek, unpaidAging, wardCounts, weeklyKpis, weeklyReservationSeries } from "./reservationAggregates";
import { CORE_DETECTORS, runDetectors } from "./insightEngine";
import { computeWeeklyPeriods } from "./period";
import { snapshotSchema } from "./snapshotSchema";
import type { CanonicalBundle } from "./labolaNormalize";
import type { FunnelCounts } from "./labolaFunnel";
import type { DateRange } from "./period";
import type { Snapshot } from "./snapshotSchema";

function inputsOf(bundle: CanonicalBundle): { type: string; rows: number }[] {
  return Object.entries(bundle.meta.counts).map(([type, rows]) => ({ type, rows }));
}

export function buildSnapshot(input: { bundle: CanonicalBundle; coverage: CanonicalBundle["meta"]["coverage"]; sourceSyncedAt: string; current: DateRange; prior: DateRange; todayYmd: string; previousSnapshot: Snapshot | null; baselineInputs: Snapshot["meta"]["inputs"] | null; funnelCounts: { current: FunnelCounts; prior: FunnelCounts } | null }): Snapshot {
  const { bundle, coverage, sourceSyncedAt, todayYmd, previousSnapshot, baselineInputs, funnelCounts } = input;
  const referenceYmd = todayYmd <= coverage.end ? todayYmd : coverage.end;
  // 完了週は収録最終日を基準に確定する。これにより古いCSVの未収録期間を分析しない。
  const { current, prior } = computeWeeklyPeriods(new Date(`${referenceYmd}T12:00:00+09:00`));
  const isFunnelWeekCovered = coverage.start <= input.current.start && coverage.end >= input.current.end;
  // GA4完了数だけが対象週でも、CSVが週全体を含まないとセルフ予約数を正しく比較できない。
  const funnel = funnelCounts === null || !isFunnelWeekCovered ? undefined : (() => {
    const selfBooked = selfBookedInWeek(bundle.reservations, input.current);
    const ga4Complete = funnelCounts.current.rental.complete + funnelCounts.current.program.complete;
    return { week: { start: input.current.start, end: input.current.end }, current: funnelCounts.current, prior: funnelCounts.prior, capture: { ga4Complete, selfBooked, rate: selfBooked === 0 ? null : ga4Complete / selfBooked } };
  })();
  return snapshotSchema.parse({
    schemaVersion: 1,
    generatedAt: bundle.meta.generatedAt,
    coverage,
    analysis: { referenceYmd, currentWeek: current },
    meta: { sourceSyncedAt, inputs: inputsOf(bundle), excludedCount: bundle.meta.excludedCount, missingSections: bundle.meta.missingSections, warnings: [...bundle.meta.warnings, ...(funnelCounts !== null && !isFunnelWeekCovered ? ["CSVの収録範囲が対象週を含まないためファネルを省略しました"] : [])] },
    kpi: weeklyKpis(bundle, current, prior, referenceYmd),
    catalog: { heatmap: demandHeatmap(bundle, referenceYmd), leadTime: leadTimeStats(bundle, referenceYmd), cancellation: cancellationStats(bundle, referenceYmd), wards: wardCounts(bundle), programFills: bundle.meta.missingSections.includes("program") ? undefined : programFills(bundle, referenceYmd), unpaidAging: unpaidAging(bundle, referenceYmd), paymentMethods: paymentMethodShare(bundle, referenceYmd), demographics: demographics(bundle), revPach: bundle.meta.missingSections.includes("blocked") ? undefined : revPach(bundle, referenceYmd) },
    series: { weeklyReservations: weeklyReservationSeries(bundle) },
    ...(funnel === undefined ? {} : { funnel }),
    insights: runDetectors({ bundle, current, prior, todayYmd: referenceYmd, previousSnapshot, baselineInputs, funnel: funnel ?? null }, CORE_DETECTORS),
  });
}
