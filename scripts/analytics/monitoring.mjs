// ランキングに依存しない監視対象。失敗・欠落はゼロ件と区別する。
import { CTA_EVENTS } from "./ctaEvents.mjs";
import { formatDelta } from "./articleMetrics.mjs";

const PAGE_PATHS = ["/reserve", "/reserve/", "/en/reserve", "/en/reserve/", "/hyrox", "/hyrox/", "/en/hyrox", "/en/hyrox/"];

export async function collectMonitoring({ token, propertyId, cur, prv }) {
  const sources = [
    { dimension: "eventName", metric: "eventCount", values: CTA_EVENTS },
    { dimension: "pagePath", metric: "screenPageViews", values: PAGE_PATHS },
  ];
  const reports = await Promise.all(sources.flatMap(({ dimension, metric, values }) =>
    [cur, prv].map(async (period) => {
      try {
        const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ dateRanges: [period], dimensions: [{ name: dimension }], metrics: [{ name: metric }],
            dimensionFilter: { filter: { fieldName: dimension, inListFilter: { values } } }, limit: 1000 }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) return { values: null, error: `HTTP ${response.status}` };
        const report = await response.json();
        const rows = report.rows ?? [];
        if (!Array.isArray(rows) || report.rowCount > rows.length || report.metadata?.subjectToThresholding || report.metadata?.dataLossFromOtherRow) {
          return { values: null, error: "不完全なレポート" };
        }
        const result = new Map();
        for (const row of rows) {
          const key = row.dimensionValues?.[0]?.value;
          const raw = row.metricValues?.[0]?.value;
          if (typeof key !== "string" || typeof raw !== "string" || raw.trim() === "" || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
            return { values: null, error: "不正なレポート" };
          }
          const name = dimension === "pagePath" ? key.replace(/^\/en\//, "/").replace(/\/$/, "") : key;
          result.set(name, (result.get(name) ?? 0) + Number(raw));
        }
        return { values: result, error: null };
      } catch {
        return { values: null, error: "通信または応答解析に失敗" };
      }
    })
  ));
  const metrics = [...CTA_EVENTS, "/reserve", "/hyrox"].map((name) => {
    const index = name.startsWith("/") ? 2 : 0;
    const current = reports[index].values === null ? null : reports[index].values.get(name) ?? 0;
    const previous = reports[index + 1].values === null ? null : reports[index + 1].values.get(name) ?? 0;
    return { name, current, previous,
      deltaPercent: current !== null && previous !== null && previous > 0 ? (current - previous) / previous * 100 : null,
      currentError: reports[index].error, previousError: reports[index + 1].error };
  });
  return { periods: { current: cur, previous: prv }, metrics };
}

export function formatMonitoring(report) {
  return report.metrics.map(({ name, current, previous, currentError, previousError }) => {
    const delta = current === null || previous === null ? "比較不可" : formatDelta(current, previous);
    const errors = [currentError, previousError].filter(Boolean);
    return `${name}  今期=${current ?? "取得不可"} 前期=${previous ?? "取得不可"} (${delta})${errors.length ? ` ※${errors.join(" / ")}` : ""}`;
  }).join("\n");
}
