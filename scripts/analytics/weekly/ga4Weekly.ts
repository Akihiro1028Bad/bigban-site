import { z } from "zod";

import { andFilters, hostFilter } from "../hosts.mjs";
import { gaDateToIso, weekStartOf } from "./weeks";

export interface Ga4Context {
  token: string;
  propertyId: string;
}

export interface WeeklyEventQuery {
  startDate: string;
  endDate: string;
  eventNames: readonly string[];
  host: string;
  extraFilter?: object;
}

const reportSchema = z.object({
  rows: z
    .array(
      z.object({
        dimensionValues: z.array(z.object({ value: z.string() })).min(1),
        metricValues: z.array(z.object({ value: z.string().regex(/^\d+$/u) })).min(1),
      }),
    )
    .optional(),
  rowCount: z.number().optional(),
  metadata: z.object({ subjectToThresholding: z.boolean().optional(), dataLossFromOtherRow: z.boolean().optional() }).optional(),
});

/** イベントの回数を JST の週(月曜始まり)ごとにまとめる。GA4 が不完全なレポートを返したら例外にする。 */
export async function weeklyEventCounts(ctx: Ga4Context, query: WeeklyEventQuery): Promise<Map<string, number>> {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${ctx.propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      dateRanges: [{ startDate: query.startDate, endDate: query.endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: andFilters(
        { filter: { fieldName: "eventName", inListFilter: { values: [...query.eventNames] } } },
        hostFilter(query.host),
        query.extraFilter,
      ),
      limit: 1000,
    }),
  });
  if (!response.ok) throw new Error(`GA4 失敗: ${response.status} ${(await response.text()).slice(0, 200)}`);
  const parsed = reportSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("GA4 の応答の形が想定と違います");
  const report = parsed.data;
  const rows = report.rows ?? [];
  if ((report.rowCount ?? 0) > rows.length || report.metadata?.subjectToThresholding || report.metadata?.dataLossFromOtherRow) {
    throw new Error("GA4 のレポートが不完全です(行の分割・しきい値・丸め)");
  }
  const counts = new Map<string, number>();
  for (const row of rows) {
    const week = weekStartOf(gaDateToIso(row.dimensionValues[0].value));
    counts.set(week, (counts.get(week) ?? 0) + Number(row.metricValues[0].value));
  }
  return counts;
}
