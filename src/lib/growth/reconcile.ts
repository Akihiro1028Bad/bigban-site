import type { PendingItem } from "./approve";
import type { WorkerRunView } from "./workerLog";

export type ReconcileSeverity = "info" | "warning" | "error";

export interface ReconcileFinding {
  targetPageId: string | null;
  targetTitle: string | null;
  severity: ReconcileSeverity;
  detail: string;
}

const DEFAULT_STALE_MS = 30 * 60 * 1000;

function hasRecentRunFor(item: PendingItem, runs: readonly WorkerRunView[], nowMs: number, staleMs: number): boolean {
  return runs.some((run) => {
    if (run.targetPageId !== item.id) return false;
    const base = run.startedAt ?? run.recordedAt;
    if (!base) return false;
    const ms = Date.parse(base);
    return !Number.isNaN(ms) && nowMs - ms <= staleMs;
  });
}

export function reconcileGrowthState(
  items: readonly PendingItem[],
  runs: readonly WorkerRunView[],
  nowMs = Date.now(),
  staleMs = DEFAULT_STALE_MS
): ReconcileFinding[] {
  const findings: ReconcileFinding[] = [];
  for (const item of items) {
    const activities = item.activities ?? [];
    for (const activity of activities) {
      if ((activity.status === "requested" || activity.status === "running") && !hasRecentRunFor(item, runs, nowMs, staleMs)) {
        findings.push({
          targetPageId: item.id,
          targetTitle: item.title,
          severity: "warning",
          detail: `${activity.label} が ${activity.status === "requested" ? "依頼中" : "処理中"} ですが、直近の worker 実行履歴がありません。`,
        });
      }
      if (activity.hasResult && activity.status !== "presented" && activity.status !== "failed") {
        findings.push({
          targetPageId: item.id,
          targetTitle: item.title,
          severity: "warning",
          detail: `${activity.label} の結果がありますが、提示中/失敗として表示されていません。`,
        });
      }
    }
    if (item.scheduledAtMs != null && item.scheduledAtMs <= nowMs && item.stage !== "published") {
      findings.push({
        targetPageId: item.id,
        targetTitle: item.title,
        severity: "warning",
        detail: "公開予約時刻を過ぎていますが、記事が公開済みではありません。",
      });
    }
    if (item.isDraftReady && item.contentId && !item.hasDraftBody) {
      findings.push({
        targetPageId: item.id,
        targetTitle: item.title,
        severity: "warning",
        detail: "下書きIDがありますが、下書き本文HTMLのミラーが空です。",
      });
    }
    if (item.kind === "proposal" && item.stage === "completed" && !item.artifactUrl) {
      findings.push({
        targetPageId: item.id,
        targetTitle: item.title,
        severity: "warning",
        detail: "成果物化済みですが、成果物リンクがありません。",
      });
    }
  }
  return findings;
}
