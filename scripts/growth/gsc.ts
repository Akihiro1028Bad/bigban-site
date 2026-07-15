/**
 * Search Console API (searchAnalytics.query) から週次データを取得する。
 *
 * GSC にはバッチ取得が無いため、レポート定義 × (current/prior) ぶん
 * 個別にクエリし、transform で前週比つきに整形する。
 */

import type { GrowthConfig } from "./config";
import type { DateRange } from "./period";
import { defaultFetch, postJson, type FetchFn } from "./http";
import { parseGscReport, mergeRows, type GscReport, type MergedRow } from "./transform";

const GSC_ENDPOINT = "https://www.googleapis.com/webmasters/v3";

/** ディメンションフィルタ(#計測強化 S2: 記事ごとの page 絞り込み等)。 */
export interface GscDimensionFilter {
  dimension: string;
  /** GSC の演算子。既定は "equals"。 */
  operator?: string;
  expression: string;
}

export interface GscReportDef {
  /** 出力オブジェクトのキー。 */
  key: string;
  /** GSC ディメンション。サマリーは空配列。 */
  dimensions: string[];
  /** 取得行数の上限。 */
  rowLimit?: number;
  /** dimensionFilterGroups(AND グループ1つ)。記事ごとの page=URL 絞り込みに使う。 */
  filters?: GscDimensionFilter[];
  /** currentに無くpriorにだけある集計行をcurrent=0として保持する。 */
  includePriorOnly?: boolean;
}

/** 既定で取得するレポート群(幅広く)。 */
export const GSC_REPORTS: GscReportDef[] = [
  { key: "summary", dimensions: [], includePriorOnly: true },
  { key: "topQueries", dimensions: ["query"], rowLimit: 25 },
  { key: "topPages", dimensions: ["page"], rowLimit: 25 },
  { key: "queryPage", dimensions: ["query", "page"], rowLimit: 25 },
  { key: "byDevice", dimensions: ["device"] },
];

interface FetchGscOptions {
  config: GrowthConfig;
  accessToken: string;
  current: DateRange;
  prior: DateRange;
  fetchFn?: FetchFn;
  reports?: GscReportDef[];
}

function buildBody(def: GscReportDef, range: DateRange) {
  const body: Record<string, unknown> = {
    startDate: range.start,
    endDate: range.end,
  };
  if (def.dimensions.length > 0) {
    body.dimensions = def.dimensions;
  }
  if (def.rowLimit !== undefined) {
    body.rowLimit = def.rowLimit;
  }
  if (def.filters && def.filters.length > 0) {
    body.dimensionFilterGroups = [
      {
        filters: def.filters.map((f) => ({
          dimension: f.dimension,
          operator: f.operator ?? "equals",
          expression: f.expression,
        })),
      },
    ];
  }
  return body;
}

export async function fetchGsc(
  options: FetchGscOptions
): Promise<Record<string, MergedRow[]>> {
  const {
    config,
    accessToken,
    current,
    prior,
    fetchFn = defaultFetch,
    reports = GSC_REPORTS,
  } = options;

  const url = `${GSC_ENDPOINT}/sites/${encodeURIComponent(
    config.gscSiteUrl
  )}/searchAnalytics/query`;

  const query = (def: GscReportDef, range: DateRange) =>
    postJson(url, accessToken, buildBody(def, range), fetchFn) as Promise<GscReport>;

  const result: Record<string, MergedRow[]> = {};
  for (const def of reports) {
    const currentReport = await query(def, current);
    const priorReport = await query(def, prior);
    result[def.key] = mergeRows(
      parseGscReport(currentReport),
      parseGscReport(priorReport),
      { includePriorOnly: def.includePriorOnly === true }
    );
  }

  return result;
}
