"use client";

import type { CurrentWorkerTarget, GrowthOpsView, WorkerRunView } from "@/lib/growth/workerLog";

import { IconCheckCircle, IconClock, IconFileText, IconRefresh, IconSparkles, IconX } from "./ui/icons";

interface OpsViewProps {
  ops: GrowthOpsView | null;
  activityTargets?: CurrentWorkerTarget[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function formatElapsed(ms: number | null): string {
  if (ms == null) return "";
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "1分未満";
  if (minutes < 60) return `${minutes}分`;
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusColor(status: string): string {
  if (status === "healthy" || status === "success") return "var(--p-green)";
  if (status === "failed" || status === "stale") return "var(--p-red)";
  if (status === "running") return "var(--p-purple)";
  return "var(--p-text-3)";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] p-4" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
      <h2 className="mb-3 text-[13px] font-semibold" style={{ color: "var(--p-text)" }}>{title}</h2>
      {children}
    </section>
  );
}

function RunRow({ run }: { run: WorkerRunView }) {
  return (
    <div className="grid gap-2 border-t py-2 text-[12px] first:border-t-0 md:grid-cols-[110px_1fr_120px]" style={{ borderColor: "var(--p-border)" }}>
      <span className="font-medium" style={{ color: statusColor(run.status) }}>{run.status}</span>
      <span className="min-w-0 truncate" style={{ color: "var(--p-text-2)" }}>
        {run.targetTitle || run.mode || "system"}
        <span style={{ color: "var(--p-text-3)" }}> / {run.mode}</span>
      </span>
      <span className="tabular-nums" style={{ color: "var(--p-text-3)" }}>{formatDate(run.startedAt ?? run.recordedAt)}</span>
      {run.detail ? (
        <span className="md:col-span-3" style={{ color: "var(--p-text-3)" }}>{run.detail}</span>
      ) : null}
    </div>
  );
}

export function OpsView({ ops, activityTargets = [], isLoading, error, onRefresh }: OpsViewProps) {
  if (isLoading && !ops) {
    return <div className="p-6 text-[13px]" style={{ color: "var(--p-text-3)" }}>運用状態を読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-[10px] p-4 text-[13px]" style={{ background: "var(--p-red-weak)", color: "var(--p-red)" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!ops) return null;
  const visibleTargets = ops.currentTargets.length > 0 ? ops.currentTargets : activityTargets;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-[18px] font-semibold">運用</h1>
          <p className="text-[12px]" style={{ color: "var(--p-text-3)" }}>
            worker の生存状態、現在処理中の記事、直近失敗、reconcile 結果
          </p>
        </div>
        <button onClick={onRefresh} className="approve-btn-ghost ml-auto">
          <IconRefresh size={14} /> 更新
        </button>
      </div>

      {ops.setupMissing ? (
        <Section title="セットアップ">
          <div className="text-[13px]" style={{ color: "var(--p-amber)" }}>
            GROWTH_WORKER_LOG_DS が未設定です。設定すると worker 状態と実行履歴をここに表示できます。
          </div>
        </Section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Worker状態">
          <div className="flex items-center gap-2 text-[13px]">
            {ops.worker.status === "healthy" ? <IconCheckCircle size={16} /> : <IconClock size={16} />}
            <span className="font-semibold" style={{ color: statusColor(ops.worker.status) }}>{ops.worker.status}</span>
            <span style={{ color: "var(--p-text-3)" }}>最終 heartbeat {formatDate(ops.worker.lastHeartbeatAt)}</span>
          </div>
        </Section>

        <Section title="現在処理中">
          {visibleTargets.length === 0 ? (
            <div className="text-[13px]" style={{ color: "var(--p-text-3)" }}>現在処理中の対象はありません。</div>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleTargets.map((target) => (
                <div key={`${target.mode}-${target.targetPageId ?? target.startedAt}`} className="flex items-center gap-2 text-[13px]">
                  <IconSparkles size={15} className="approve-pulse" />
                  <span className="min-w-0 truncate" style={{ color: "var(--p-text)" }}>
                    {target.targetTitle || "system"}
                  </span>
                  <span style={{ color: "var(--p-text-3)" }}>/ {target.mode} / {formatElapsed(target.elapsedMs)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="直近失敗">
        {ops.recentFailures.length === 0 ? (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--p-green)" }}>
            <IconCheckCircle size={15} /> 直近失敗はありません。
          </div>
        ) : (
          ops.recentFailures.map((run) => <RunRow key={run.id} run={run} />)
        )}
      </Section>

      <Section title="reconcile 結果">
        {ops.reconcileFindings.length === 0 ? (
          <div className="text-[13px]" style={{ color: "var(--p-text-3)" }}>未検出、またはまだ実行されていません。</div>
        ) : (
          <div className="flex flex-col gap-2">
            {ops.reconcileFindings.map((finding) => (
              <div key={finding.id} className="flex items-start gap-2 text-[13px]">
                <IconX size={15} style={{ color: finding.severity === "error" ? "var(--p-red)" : "var(--p-amber)" }} />
                <div className="min-w-0">
                  <div style={{ color: "var(--p-text)" }}>{finding.targetTitle || "system"}</div>
                  <div style={{ color: "var(--p-text-3)" }}>{finding.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="直近run履歴">
        {ops.recentRuns.length === 0 ? (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--p-text-3)" }}>
            <IconFileText size={15} /> 履歴はまだありません。
          </div>
        ) : (
          ops.recentRuns.slice(0, 12).map((run) => <RunRow key={run.id} run={run} />)
        )}
      </Section>
    </div>
  );
}
