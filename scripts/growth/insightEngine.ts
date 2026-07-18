/** 気づき検出器を実行し、前回スナップショットとの継続状態を付与する。 */
import { dataHealth } from "./insightDetectors/dataHealth";
import { fillSpeed } from "./insightDetectors/fillSpeed";
import { firstSeenWard } from "./insightDetectors/firstSeenWard";
import { leadTimeShift } from "./insightDetectors/leadTimeShift";
import { newRemarks } from "./insightDetectors/newRemarks";
import { paceDeviation } from "./insightDetectors/paceDeviation";
import { reservationCountChange } from "./insightDetectors/reservationCountChange";
import { selfRateChange } from "./insightDetectors/selfRateChange";
import { unpaidOverdue } from "./insightDetectors/unpaidOverdue";
import type { CanonicalBundle } from "./labolaNormalize";
import type { DateRange } from "./period";
import type { Insight, Snapshot } from "./snapshotSchema";

export interface DetectorContext {
  bundle: CanonicalBundle;
  previousSnapshot: Snapshot | null;
  baselineInputs: Snapshot["meta"]["inputs"] | null;
  history?: Snapshot[];
  funnel: Snapshot["funnel"] | null;
  onTheBooks?: { daysOut: number; reservations: number; baselineMedian: number | null }[] | null;
  current: DateRange;
  prior: DateRange;
  todayYmd: string;
}

export type Detector = (context: DetectorContext) => Omit<Insight, "firstSeen" | "status">[];

function previousById(snapshot: Snapshot | null): Map<string, Insight> {
  return new Map(snapshot?.insights.map((insight) => [insight.id, insight]) ?? []);
}

export function runDetectors(context: DetectorContext, detectors: readonly Detector[]): Insight[] {
  const previous = previousById(context.previousSnapshot);
  const emitted = new Map<string, Omit<Insight, "firstSeen" | "status">>();
  for (const detector of detectors) for (const insight of detector(context)) emitted.set(insight.id, insight);
  return [...emitted.values()].map((insight) => {
    const prior = previous.get(insight.id);
    return { ...insight, firstSeen: prior?.firstSeen ?? context.todayYmd, status: prior ? "recurring" : "new" };
  });
}

export const CORE_DETECTORS: readonly Detector[] = [
  firstSeenWard,
  reservationCountChange,
  selfRateChange,
  leadTimeShift,
  fillSpeed,
  paceDeviation,
  dataHealth,
  newRemarks,
  unpaidOverdue,
];
