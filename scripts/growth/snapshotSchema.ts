/** 予約分析スナップショットの共有スキーマ。 */
import { z } from "zod";
import { coverageSchema, isoDateTimeSchema } from "./dateSchemas";

export const insightSchema = z.object({
  id: z.string(),
  detector: z.string(),
  severity: z.enum(["info", "notice", "alert"]),
  title: z.string(),
  body: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  label: z.enum(["有意", "観察"]),
  firstSeen: z.string(),
  status: z.enum(["new", "recurring"]),
});

export type Insight = z.infer<typeof insightSchema>;

export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: isoDateTimeSchema,
  coverage: coverageSchema,
  meta: z.object({
    inputs: z.array(z.object({ type: z.string(), rows: z.number() })),
    excludedCount: z.number(),
    missingSections: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  kpi: z.object({
    actual: z.object({ currentWeek: z.number(), priorWeek: z.number(), cumulative: z.number() }),
    self: z.object({ selfCount4w: z.number(), total4w: z.number(), smartphone4w: z.number() }),
    sales: z.object({ currentWeek: z.number().nullable(), priorWeek: z.number().nullable(), forecast28: z.number().nullable() }),
  }),
  catalog: z.object({
    heatmap: z.array(z.object({ dow: z.number(), slot: z.string(), count: z.number() })),
    leadTime: z.object({ n: z.number(), median: z.number(), p25: z.number(), p75: z.number() }).nullable(),
    cancellation: z.object({ n: z.number(), cancelled: z.number(), rate: z.number(), ciLow: z.number(), ciHigh: z.number() }).nullable(),
    wards: z.array(z.object({ ward: z.string(), customers: z.number(), reservations: z.number() })),
  }),
  series: z.object({ weeklyReservations: z.array(z.object({ weekStart: z.string(), count: z.number() })) }),
  insights: z.array(insightSchema),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

export function parseSnapshot(json: string): Snapshot {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("スナップショットJSONが不正です");
  }
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) throw new Error(`スナップショットの形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}
