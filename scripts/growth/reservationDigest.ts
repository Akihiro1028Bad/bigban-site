/** 予約取り込み結果をLINEと人間レビュー用の文字列へ整形する。 */
import { jstYmdOfIso } from "./reservationAggregates";
import type { RemarkEntry } from "./labolaNormalize";
import type { Insight, Snapshot } from "./snapshotSchema";

const SEVERITY_ORDER: Record<Insight["severity"], number> = { alert: 0, notice: 1, info: 2 };

function sortedNewInsights(snapshot: Snapshot): Insight[] {
  return snapshot.insights.filter((insight) => insight.status === "new").sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]);
}
function digestTitle(insight: Insight): string {
  if (insight.id.startsWith("d1:")) return "新しいエリアからの初予約がありました(詳細はスナップショット)";
  return typeof insight.evidence.n === "number" && insight.evidence.n < 3 ? "小標本の気づきがあります(詳細はスナップショット)" : insight.title;
}

export function formatIngestDigest(snapshot: Snapshot): string {
  const insights = sortedNewInsights(snapshot);
  const lines = [
    `📊 予約データ取り込み(${jstYmdOfIso(snapshot.generatedAt)})`,
    `実予約 今週${snapshot.kpi.actual.currentWeek}件(累積${snapshot.kpi.actual.cumulative}件)`,
    `新規気づき${insights.length}件`,
  ];
  lines.push(...insights.slice(0, 5).map((insight) => `・${digestTitle(insight)}`));
  if (snapshot.meta.warnings.length > 0) lines.push(`⚠️ 警告${snapshot.meta.warnings.length}件`);
  return lines.join("\n");
}

export function formatRemarksReview(remarks: RemarkEntry[], generatedYmd: string): string {
  const lines = [
    "⚠️ このファイルはAIプロンプトに投入しないこと(氏名等が混入し得る)",
    `# 備考レビュー (${generatedYmd})`,
  ];
  for (const remark of remarks) lines.push(`- 予約番号${remark.reservationId} | ${remark.useDate} | ${remark.category}\n  ${remark.remarks}`);
  return lines.join("\n");
}
