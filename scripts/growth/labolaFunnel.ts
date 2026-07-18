/** Labola予約ファネルのGA4イベント定義と集計。 */

import type { Ga4ReportDef } from "./ga4";
import type { MergedRow } from "./transform";

/** Labola予約ファネルで計測するGA4イベント名の正典。 */
export const LABOLA_FUNNEL_EVENTS = {
  rental: {
    input: "labola_step_input",
    confirm: "labola_step_confirm",
    pending: "labola_reserve_pending",
    complete: "labola_reserve_complete",
  },
  program: {
    input: "labola_step_input_program",
    confirm: "labola_step_confirm_program",
    pending: "labola_reserve_pending_program",
    complete: "labola_reserve_complete_program",
  },
  intent: {
    reservationClick: "reservation_click",
    reserveEntryClick: "reserve_entry_click",
  },
} as const;

const LABOLA_FUNNEL_EVENT_NAMES = [
  ...Object.values(LABOLA_FUNNEL_EVENTS.rental),
  ...Object.values(LABOLA_FUNNEL_EVENTS.program),
  ...Object.values(LABOLA_FUNNEL_EVENTS.intent),
] as const;

/** Labola予約ファネルをGA4から取得するレポート定義。 */
export const LABOLA_FUNNEL_REPORT: Ga4ReportDef = {
  key: "labolaFunnel",
  dimensions: ["eventName"],
  // キーイベント設定に依存しないよう、発火件数そのものを使う。
  metrics: ["eventCount"],
  dimensionFilter: { fieldName: "eventName", values: LABOLA_FUNNEL_EVENT_NAMES },
  limit: 100,
  includePriorOnly: true,
};

export interface FunnelStageCounts {
  input: number;
  confirm: number;
  pending: number;
  complete: number;
}

export interface FunnelCounts {
  intent: number;
  rental: FunnelStageCounts;
  program: FunnelStageCounts;
}

type FunnelEventBucket =
  | { flow: "intent" }
  | { flow: "rental" | "program"; stage: keyof FunnelStageCounts };

const BUCKET_BY_EVENT: Readonly<Partial<Record<string, FunnelEventBucket>>> = {
  [LABOLA_FUNNEL_EVENTS.intent.reservationClick]: { flow: "intent" },
  [LABOLA_FUNNEL_EVENTS.intent.reserveEntryClick]: { flow: "intent" },
  [LABOLA_FUNNEL_EVENTS.rental.input]: { flow: "rental", stage: "input" },
  [LABOLA_FUNNEL_EVENTS.rental.confirm]: { flow: "rental", stage: "confirm" },
  [LABOLA_FUNNEL_EVENTS.rental.pending]: { flow: "rental", stage: "pending" },
  [LABOLA_FUNNEL_EVENTS.rental.complete]: { flow: "rental", stage: "complete" },
  [LABOLA_FUNNEL_EVENTS.program.input]: { flow: "program", stage: "input" },
  [LABOLA_FUNNEL_EVENTS.program.confirm]: { flow: "program", stage: "confirm" },
  [LABOLA_FUNNEL_EVENTS.program.pending]: { flow: "program", stage: "pending" },
  [LABOLA_FUNNEL_EVENTS.program.complete]: { flow: "program", stage: "complete" },
};

function emptyFunnelCounts(): FunnelCounts {
  return {
    intent: 0,
    rental: { input: 0, confirm: 0, pending: 0, complete: 0 },
    program: { input: 0, confirm: 0, pending: 0, complete: 0 },
  };
}

/** GA4のイベント別集計行をLabola予約ファネルへ集約する。 */
export function funnelFromRows(rows: MergedRow[]): {
  current: FunnelCounts;
  prior: FunnelCounts;
} {
  const current = emptyFunnelCounts();
  const prior = emptyFunnelCounts();

  for (const row of rows) {
    const bucket = BUCKET_BY_EVENT[row.keys[0] as string];
    if (bucket === undefined) continue;

    const metric = row.metrics.eventCount;
    const currentValue = metric?.current ?? 0;
    const priorValue = metric?.prior ?? 0;
    if (bucket.flow === "intent") {
      current.intent += currentValue;
      prior.intent += priorValue;
      continue;
    }

    current[bucket.flow][bucket.stage] += currentValue;
    prior[bucket.flow][bucket.stage] += priorValue;
  }

  return { current, prior };
}
