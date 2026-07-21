/**
 * GA4 / GSC のデータ取得を束ね、週次スナップショットオブジェクトを組み立てる。
 *
 * 片方の取得が失敗しても処理は止めず、もう片方を取得して errors に記録する
 * (週次バッチが全滅しないようにするため)。取得関数は注入可能。
 */

import type { GrowthConfig } from "./config";
import type { DateRange } from "./period";
import type { MergedRow } from "./transform";
import { fetchGa4 } from "./ga4";
import { fetchGsc } from "./gsc";
import { summarizeLabolaFunnel } from "./labolaFunnel";
import type { LabolaFunnelSummary } from "./labolaFunnel";

type ReportMap = Record<string, MergedRow[]>;

export interface CollectDeps {
  fetchGa4: (opts: {
    config: GrowthConfig;
    accessToken: string;
    current: DateRange;
    prior: DateRange;
  }) => Promise<ReportMap>;
  fetchGsc: (opts: {
    config: GrowthConfig;
    accessToken: string;
    current: DateRange;
    prior: DateRange;
  }) => Promise<ReportMap>;
}

export interface GrowthSnapshot {
  generatedAt: string;
  period: DateRange;
  priorPeriod: DateRange;
  ga4: ReportMap | null;
  reservationFunnel: LabolaFunnelSummary | null;
  gsc: ReportMap | null;
  errors: { source: string; message: string }[];
}

interface CollectOptions {
  config: GrowthConfig;
  accessToken: string;
  current: DateRange;
  prior: DateRange;
  generatedAt: string;
  deps?: CollectDeps;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function collectGrowthData(
  options: CollectOptions
): Promise<GrowthSnapshot> {
  const {
    config,
    accessToken,
    current,
    prior,
    generatedAt,
    deps = { fetchGa4, fetchGsc },
  } = options;

  const errors: { source: string; message: string }[] = [];
  const fetchArgs = { config, accessToken, current, prior };

  let ga4: ReportMap | null = null;
  try {
    ga4 = await deps.fetchGa4(fetchArgs);
  } catch (error: unknown) {
    errors.push({ source: "ga4", message: toMessage(error) });
  }

  let gsc: ReportMap | null = null;
  try {
    gsc = await deps.fetchGsc(fetchArgs);
  } catch (error: unknown) {
    errors.push({ source: "gsc", message: toMessage(error) });
  }

  const reservationFunnel = ga4 === null
    ? null
    : summarizeLabolaFunnel({ period: current, rows: ga4.labolaFunnel ?? [] });

  return { generatedAt, period: current, priorPeriod: prior, ga4, reservationFunnel, gsc, errors };
}
