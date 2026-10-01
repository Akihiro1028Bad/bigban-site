/** PageSpeed Insights API の実ユーザーデータ(CrUX・過去28日・モバイル)を、主要ページごとに取る。 */
import { z } from "zod";

export const CRUX_PATHS = ["/", "/reserve", "/hyrox", "/en"] as const;

/** PSI の指標キーと表示名。CLS だけ百分の一の整数(5 = 0.05)で返るので scale で戻す。 */
const METRICS = [
  { name: "LCP", key: "LARGEST_CONTENTFUL_PAINT_MS", scale: 1 },
  { name: "INP", key: "INTERACTION_TO_NEXT_PAINT", scale: 1 },
  { name: "CLS", key: "CUMULATIVE_LAYOUT_SHIFT_SCORE", scale: 100 },
  { name: "FCP", key: "FIRST_CONTENTFUL_PAINT_MS", scale: 1 },
  { name: "TTFB", key: "EXPERIMENTAL_TIME_TO_FIRST_BYTE", scale: 1 },
] as const;

/** 秒で出す指標。それ以外(INP・TTFB)はミリ秒、CLS は無単位。 */
const SECONDS_METRICS: readonly string[] = ["LCP", "FCP"];
const CATEGORY_LABELS: Readonly<Record<string, string>> = { FAST: "良好", AVERAGE: "要改善", SLOW: "不良" };

export interface CruxMetric {
  name: string;
  p75: number | null;
  category: string | null;
}

export interface CruxPageResult {
  path: string;
  scope: "page" | "origin";
  metrics: CruxMetric[];
}

const experienceSchema = z
  .object({
    metrics: z.record(z.string(), z.object({ percentile: z.number(), category: z.string() })).optional(),
    origin_fallback: z.boolean().optional(),
  })
  .optional();
const psiSchema = z.object({ loadingExperience: experienceSchema, originLoadingExperience: experienceSchema });

type Experience = z.infer<typeof experienceSchema>;

function toMetrics(experience: Experience): CruxMetric[] {
  return METRICS.map(({ name, key, scale }) => {
    const metric = experience?.metrics?.[key];
    return { name, p75: metric ? metric.percentile / scale : null, category: metric?.category ?? null };
  });
}

export async function fetchCruxResults(deps: { apiKey: string; baseUrl: string }): Promise<CruxPageResult[]> {
  const results: CruxPageResult[] = [];
  for (const path of CRUX_PATHS) {
    const query = new URLSearchParams({ url: `${deps.baseUrl}${path}`, strategy: "mobile", category: "performance", key: deps.apiKey });
    const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${query}`, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`PSI 失敗: ${response.status}`);
    const parsed = psiSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("PSI の応答の形が想定と違います");
    const page = parsed.data.loadingExperience;
    const hasPageData = page?.metrics !== undefined && page.origin_fallback !== true;
    results.push({
      path,
      scope: hasPageData ? "page" : "origin",
      metrics: toMetrics(hasPageData ? page : parsed.data.originLoadingExperience),
    });
  }
  return results;
}

function formatValue(name: string, p75: number): string {
  if (name === "CLS") return p75.toFixed(2);
  return SECONDS_METRICS.includes(name) ? `${(p75 / 1000).toFixed(1)}s` : `${Math.round(p75)}ms`;
}

function formatMetric({ name, p75, category }: CruxMetric): string {
  if (p75 === null) return `${name} 取得不可`;
  const label = category === null ? undefined : CATEGORY_LABELS[category];
  return `${name} ${formatValue(name, p75)}${label ? `(${label})` : ""}`;
}

export function formatCruxResults(results: readonly CruxPageResult[]): string {
  return results
    .map(({ path, scope, metrics }) => {
      const scopeLabel = scope === "page" ? "ページ単位" : "オリジンで代替(ページ単位は件数不足)";
      return `${path}  [${scopeLabel}]  ${metrics.map(formatMetric).join(" ")}`;
    })
    .join("\n");
}

export function formatCruxSkipped(): string {
  return "PSI_API_KEY が未設定のため CrUX の取得をスキップしました(手順書: docs/operations/measurement-repair-checklist.md)";
}
