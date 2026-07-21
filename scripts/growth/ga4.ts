/**
 * GA4 Data API (batchRunReports) から週次データを取得する。
 *
 * 各レポート定義について current / prior の2期間ぶんのリクエストを作り、
 * 1回の batchRunReports で取得 → transform で前週比つきに整形する。
 */

import type { GrowthConfig } from "./config";
import type { DateRange } from "./period";
import { defaultFetch, postJson, type FetchFn } from "./http";
import {
  parseGa4Report,
  mergeRows,
  type Ga4Report,
  type MergedRow,
} from "./transform";
import { CTA_EVENT_NAMES } from "./ctaEvents";
import { LABOLA_FUNNEL_EVENT_NAMES } from "./labolaFunnel";

const GA4_ENDPOINT = "https://analyticsdata.googleapis.com/v1beta";

/** batchRunReports は1リクエストにつき最大5レポートまで。 */
const MAX_BATCH_SIZE = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export interface Ga4ReportDef {
  /** 出力オブジェクトのキー。 */
  key: string;
  /** GA4 ディメンション名。サマリーは空配列。 */
  dimensions: string[];
  /** GA4 指標名。 */
  metrics: string[];
  /** 取得行数の上限(ブレイクダウン用)。 */
  limit?: number;
  /** 単一ディメンションの値を許可リストで絞る。 */
  dimensionFilter?: { fieldName: string; values: readonly string[] };
  /** currentに無くpriorにだけある行をcurrent=0として保持する。 */
  includePriorOnly?: boolean;
}

/** 既定で取得するレポート群(幅広く)。 */
export const GA4_REPORTS: Ga4ReportDef[] = [
  {
    key: "summary",
    dimensions: [],
    metrics: ["sessions", "activeUsers", "engagementRate", "keyEvents"],
  },
  {
    key: "byChannel",
    dimensions: ["sessionDefaultChannelGroup"],
    metrics: ["sessions", "activeUsers", "keyEvents"],
    limit: 20,
  },
  {
    key: "byDevice",
    dimensions: ["deviceCategory"],
    metrics: ["sessions", "activeUsers", "engagementRate"],
  },
  {
    key: "topPages",
    dimensions: ["pagePath"],
    metrics: ["screenPageViews", "activeUsers"],
    limit: 20,
    includePriorOnly: true,
  },
  {
    key: "landingPages",
    dimensions: ["landingPage"],
    metrics: ["sessions", "activeUsers", "keyEvents"],
    limit: 20,
  },
  {
    key: "ctaEvents",
    dimensions: ["eventName"],
    metrics: ["keyEvents"],
    dimensionFilter: { fieldName: "eventName", values: CTA_EVENT_NAMES },
    limit: 10_000,
    includePriorOnly: true,
  },
  {
    key: "labolaFunnel",
    dimensions: ["eventName"],
    // キーイベント登録に依存せず、タグの発火件数を参考値として取得する。
    metrics: ["eventCount"],
    dimensionFilter: { fieldName: "eventName", values: LABOLA_FUNNEL_EVENT_NAMES },
    limit: 100,
    includePriorOnly: true,
  },
];

interface FetchGa4Options {
  config: GrowthConfig;
  accessToken: string;
  current: DateRange;
  prior: DateRange;
  fetchFn?: FetchFn;
  reports?: Ga4ReportDef[];
}

function buildRequest(def: Ga4ReportDef, range: DateRange) {
  const request: Record<string, unknown> = {
    dimensions: def.dimensions.map((name) => ({ name })),
    metrics: def.metrics.map((name) => ({ name })),
    dateRanges: [{ startDate: range.start, endDate: range.end }],
  };
  if (def.limit !== undefined) {
    request.limit = String(def.limit);
  }
  if (def.dimensionFilter) {
    request.dimensionFilter = {
      filter: {
        fieldName: def.dimensionFilter.fieldName,
        inListFilter: { values: [...def.dimensionFilter.values] },
      },
    };
  }
  return request;
}

export async function fetchGa4(
  options: FetchGa4Options
): Promise<Record<string, MergedRow[]>> {
  const {
    config,
    accessToken,
    current,
    prior,
    fetchFn = defaultFetch,
    reports = GA4_REPORTS,
  } = options;

  const requests = reports.flatMap((def) => [
    buildRequest(def, current),
    buildRequest(def, prior),
  ]);

  const url = `${GA4_ENDPOINT}/properties/${config.ga4PropertyId}:batchRunReports`;

  // batchRunReports は最大5リクエスト/回のため分割して呼び、結果を順に連結する。
  const allReports: Ga4Report[] = [];
  for (const batch of chunk(requests, MAX_BATCH_SIZE)) {
    const body = await postJson(url, accessToken, { requests: batch }, fetchFn);
    const reportsInBatch = (body as { reports?: Ga4Report[] }).reports ?? [];
    allReports.push(...reportsInBatch);
  }

  const result: Record<string, MergedRow[]> = {};
  reports.forEach((def, index) => {
    const currentReport = allReports[index * 2] ?? {};
    const priorReport = allReports[index * 2 + 1] ?? {};
    result[def.key] = mergeRows(
      parseGa4Report(currentReport),
      parseGa4Report(priorReport),
      { includePriorOnly: def.includePriorOnly === true }
    );
  });

  return result;
}
