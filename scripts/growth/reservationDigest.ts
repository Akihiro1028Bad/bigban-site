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
  if (insight.id.startsWith("d12:")) return "新しい備考の問い合わせがあります(remarks-reviewを確認)";
  return insight.title;
}

function isOlderThanSevenDays(sourceSyncedAt: string, todayYmd: string): boolean {
  const sourceYmd = jstYmdOfIso(sourceSyncedAt);
  return new Date(`${todayYmd}T00:00:00+09:00`).getTime() - new Date(`${sourceYmd}T00:00:00+09:00`).getTime() > 7 * 24 * 60 * 60 * 1000;
}

export function formatIngestDigest(snapshot: Snapshot, todayYmd: string): string {
  const insights = sortedNewInsights(snapshot);
  const lines = [
    `📊 予約データ取り込み(${jstYmdOfIso(snapshot.generatedAt)})`,
    `実予約 対象週 ${snapshot.analysis.currentWeek.start}〜${snapshot.analysis.currentWeek.end} ${snapshot.kpi.actual.currentWeek}件(累積${snapshot.kpi.actual.cumulative}件)`,
    `新規気づき${insights.length}件`,
  ];
  lines.push(...insights.slice(0, 5).map((insight) => `・${digestTitle(insight)}`));
  if (isOlderThanSevenDays(snapshot.meta.sourceSyncedAt, todayYmd)) lines.push(`⚠️ データが古い可能性(CSV最終更新: ${jstYmdOfIso(snapshot.meta.sourceSyncedAt)})`);
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
