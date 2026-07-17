/** D11: 入力CSVの欠落と行数急減を検出する。 */
import type { Detector } from "../insightEngine";

export const dataHealth: Detector = (context) => {
  const insights = [] as ReturnType<Detector>;
  if (context.bundle.meta.missingSections.length > 0) {
    const missingSections = [...context.bundle.meta.missingSections].sort();
    insights.push({ id: `d11:missing:${missingSections.join(",")}`, detector: "D11", severity: "info", title: "入力データの欠落", body: "一部の任意CSVが見つかりません。", evidence: { n: missingSections.length, missingSections }, label: "観察" });
  }
  if (context.baselineInputs === null) return insights;
  for (const input of context.baselineInputs) {
    const currentRows = context.bundle.meta.counts[input.type];
    if (currentRows !== undefined && input.rows > 0 && currentRows < input.rows / 2) {
      insights.push({ id: `d11:rowdrop:${input.type}`, detector: "D11", severity: "alert", title: `${input.type}の行数が急減`, body: "前回の半分未満の行数です。入力を確認してください。", evidence: { n: currentRows, previousRows: input.rows }, label: "観察" });
    }
  }
  return insights;
};
