/** LaBOLA予約導線を週次提案で読むための最小集計。 */

import { CTA_EVENTS } from "./ctaEvents";
import type { DateRange } from "./period";
import type { MergedRow } from "./transform";

export const LABOLA_MEASUREMENT_START_YMD = "2026-07-18";

export const LABOLA_FUNNEL_EVENTS = {
  rental: {
    input: "labola_step_input",
    complete: "labola_reserve_complete",
  },
  program: {
    input: "labola_step_input_program",
    complete: "labola_reserve_complete_program",
  },
} as const;

export const LABOLA_FUNNEL_EVENT_NAMES = [
  CTA_EVENTS.reservation,
  LABOLA_FUNNEL_EVENTS.rental.input,
  LABOLA_FUNNEL_EVENTS.rental.complete,
  LABOLA_FUNNEL_EVENTS.program.input,
  LABOLA_FUNNEL_EVENTS.program.complete,
] as const;

export interface LabolaFunnelSummary {
  measurementStartedOn: string;
  observedDays: number;
  isReferenceOnly: boolean;
  siteToLabola: number;
  rental: { input: number; complete: number };
  program: { input: number; complete: number };
}

function inclusiveDays(from: string, to: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / millisecondsPerDay) + 1;
}

function countOf(rows: readonly MergedRow[], eventName: string): number {
  return rows.reduce((total, row) => (
    row.keys[0] === eventName ? total + (row.metrics.eventCount?.current ?? 0) : total
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

  return {
    measurementStartedOn: LABOLA_MEASUREMENT_START_YMD,
    observedDays,
    isReferenceOnly: observedDays < 7,
    siteToLabola: countOf(input.rows, CTA_EVENTS.reservation),
    rental: {
      input: countOf(input.rows, LABOLA_FUNNEL_EVENTS.rental.input),
      complete: countOf(input.rows, LABOLA_FUNNEL_EVENTS.rental.complete),
    },
    program: {
      input: countOf(input.rows, LABOLA_FUNNEL_EVENTS.program.input),
      complete: countOf(input.rows, LABOLA_FUNNEL_EVENTS.program.complete),
    },
  };
}
