/** LaBOLA予約導線を週次提案で読むための最小集計。 */

import {
  LABOLA_ENTRY_EVENTS,
  LABOLA_FUNNEL_EVENTS,
  LABOLA_MEASUREMENT_START_YMD,
} from "@/lib/growth/labolaEvents";

import type { DateRange } from "./period";
import type { MergedRow } from "./transform";

export { LABOLA_ENTRY_EVENTS, LABOLA_FUNNEL_EVENTS, LABOLA_MEASUREMENT_START_YMD };

export const LABOLA_FUNNEL_EVENT_NAMES = [
  LABOLA_ENTRY_EVENTS.rental,
  LABOLA_ENTRY_EVENTS.program,
  LABOLA_FUNNEL_EVENTS.rental.input,
  LABOLA_FUNNEL_EVENTS.rental.complete,
  LABOLA_FUNNEL_EVENTS.program.input,
  LABOLA_FUNNEL_EVENTS.program.complete,
] as const;

export interface LabolaFunnelSummary {
  measurementStartedOn: string;
  observedDays: number;
  entryMeasurementStatus: "available" | "unavailable";
  isReferenceOnly: boolean;
  siteToLabola: number | null;
  rental: { siteToLabola: number | null; input: number; complete: number };
  program: { siteToLabola: number | null; input: number; complete: number };
}

function inclusiveDays(from: string, to: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / millisecondsPerDay) + 1;
}

function countOf(
  rows: readonly MergedRow[],
  eventName: string
): number {
  return rows.reduce((total, row) => (
    row.keys[0] === eventName
      ? total + (row.metrics.sessions?.current ?? 0)
      : total
  ), 0);
}

export function summarizeLabolaFunnel(input: {
  period: DateRange;
  rows: readonly MergedRow[];
}): LabolaFunnelSummary {
  const observedStart = input.period.start > LABOLA_MEASUREMENT_START_YMD
    ? input.period.start
    : LABOLA_MEASUREMENT_START_YMD;
  const observedDays = observedStart > input.period.end ? 0 : inclusiveDays(observedStart, input.period.end);
  const rentalEntry = countOf(input.rows, LABOLA_ENTRY_EVENTS.rental);
  const programEntry = countOf(input.rows, LABOLA_ENTRY_EVENTS.program);
  const entryMeasurementStatus = observedDays === 0 ? "unavailable" : "available";
  const isEntryObservable = entryMeasurementStatus === "available";
  const siteToLabola = isEntryObservable ? rentalEntry + programEntry : null;

  return {
    measurementStartedOn: LABOLA_MEASUREMENT_START_YMD,
    observedDays,
    entryMeasurementStatus,
    isReferenceOnly: observedDays < 7,
    siteToLabola,
    rental: {
      siteToLabola: isEntryObservable ? rentalEntry : null,
      input: countOf(input.rows, LABOLA_FUNNEL_EVENTS.rental.input),
      complete: countOf(input.rows, LABOLA_FUNNEL_EVENTS.rental.complete),
    },
    program: {
      siteToLabola: isEntryObservable ? programEntry : null,
      input: countOf(input.rows, LABOLA_FUNNEL_EVENTS.program.input),
      complete: countOf(input.rows, LABOLA_FUNNEL_EVENTS.program.complete),
    },
  };
}
