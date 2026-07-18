/** D11: 入力CSVの健全性とGA4予約完了イベントの捕捉異常を検出する。 */
import type { Detector } from "../insightEngine";

export const dataHealth: Detector = (context) => {
  const insights = [] as ReturnType<Detector>;
  if (context.bundle.meta.missingSections.length > 0) {
    const missingSections = [...context.bundle.meta.missingSections].sort();
    insights.push({ id: `d11:missing:${missingSections.join(",")}`, detector: "D11", severity: "info", title: "入力データの欠落", body: "一部の任意CSVが見つかりません。", evidence: { n: missingSections.length, missingSections }, label: "観察" });
  }
  if (context.baselineInputs !== null) {
    for (const input of context.baselineInputs) {
      const currentRows = context.bundle.meta.counts[input.type];
      if (currentRows !== undefined && input.rows > 0 && currentRows < input.rows / 2) {
        insights.push({ id: `d11:rowdrop:${input.type}`, detector: "D11", severity: "alert", title: `${input.type}の行数が急減`, body: "前回の半分未満の行数です。入力を確認してください。", evidence: { n: currentRows, previousRows: input.rows }, label: "観察" });
      }
    }
  }
  const funnel = context.funnel;
  if (!funnel) return insights;
  const { ga4Complete, selfBooked, rate } = funnel.capture;
  // 少数のセルフ予約では偶然の揺れが大きいため、誤検知を避ける。
  if (selfBooked < 5) return insights;
  if (ga4Complete === 0) {
    insights.push({ id: "d11:capture:zero", detector: "D11", severity: "alert", title: "タグ破損の疑い: GA4予約完了が0件", body: "セルフ予約があるのにGA4の予約完了イベントが1件も計測されていません。LaBOLAのタグ設定を確認してください。", evidence: { n: selfBooked, ga4Complete: 0 }, label: "観察" });
    return insights;
  }
  const previousRate = context.previousSnapshot?.funnel?.capture.rate;
  if (rate !== null && previousRate !== null && previousRate !== undefined && previousRate >= 0.5 && rate < previousRate / 2) {
    insights.push({ id: "d11:capture:drop", detector: "D11", severity: "alert", title: "GA4捕捉率が急落", body: "捕捉率が前回の半分未満に落ちています。タグ破損・設定変更の可能性があります。", evidence: { n: selfBooked, rate, previousRate }, label: "観察" });
  }
  return insights;
};
