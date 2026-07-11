"use client";

import type { GrowthOpsView } from "@/lib/growth/workerLog";

import type { DashboardView as DashboardSummary } from "./homeDashboard";
import type { ApproveView } from "./viewRouting";
import { ConsoleHeader, StatusDot, SummaryButton } from "./ui/consolePrimitives";
import { IconArrowRight, IconCalendar, IconCheckCircle, IconInbox, IconList, IconPlus, IconRefresh, IconSparkles, IconX } from "./ui/icons";

interface DashboardViewProps {
  summary: DashboardSummary;
  ops: GrowthOpsView | null;
  isOpsLoading: boolean;
  opsError: string | null;
  onNavigate: (view: ApproveView, segment?: "awaiting") => void;
  onAddProposal: () => void;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DashboardView({ summary, ops, isOpsLoading, opsError, onNavigate, onAddProposal }: DashboardViewProps) {
  const totalActions = summary.proposalPending + summary.articleAwaiting + summary.publishReady + summary.publishBlocked;
  const pipeline = [
    { label: "施策", value: summary.pipeline.proposals, view: "proposal" as const },
    { label: "記事制作", value: summary.pipeline.production, view: "approve" as const },
    { label: "公開待ち", value: summary.pipeline.publishWaiting, view: "queue" as const },
    { label: "公開済み", value: summary.pipeline.published, view: "performance" as const },
  ];
  return (
    <section aria-label="ホーム" className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
      <ConsoleHeader
        eyebrow="OVERVIEW"
        title="今日の編集司令室"
        description={totalActions > 0 ? `対応が必要な項目は ${totalActions} 件です。` : "現在、急ぎの対応はありません。"}
        action={<button type="button" onClick={onAddProposal} className="approve-btn-primary"><IconPlus size={14} /> 施策を追加</button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryButton label="未処理施策" value={summary.proposalPending} hint="施策を確認" color="var(--p-amber)" icon={<IconList size={18} />} onClick={() => onNavigate("proposal")} />
        <SummaryButton label="記事のアクション待ち" value={summary.articleAwaiting} hint="記事制作を確認" color="var(--p-purple)" icon={<IconInbox size={18} />} onClick={() => onNavigate("approve", "awaiting")} />
        <SummaryButton label="公開可能" value={summary.publishReady} hint="公開キューを確認" color="var(--p-green)" icon={<IconCheckCircle size={18} />} onClick={() => onNavigate("queue")} />
        <SummaryButton label="要対応" value={summary.publishBlocked} hint="不足項目を修正" color="var(--p-red)" icon={<IconX size={18} />} onClick={() => onNavigate("queue")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="console-panel" aria-label="制作パイプライン">
          <div className="console-panel-title"><IconArrowRight size={15} /> 制作パイプライン</div>
          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            {pipeline.map((step, index) => (
              <button key={step.label} type="button" onClick={() => onNavigate(step.view)} className="relative rounded-[12px] p-4 text-left" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
                <div className="text-[10px] font-semibold tracking-wider" style={{ color: "var(--p-text-3)" }}>0{index + 1}</div>
                <div className="mt-3 text-[24px] font-semibold tabular-nums">{step.value}</div>
                <div className="mt-1 text-[12px]" style={{ color: "var(--p-text-2)" }}>{step.label}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="console-panel" aria-label="AI稼働状況">
          <div className="console-panel-title"><IconSparkles size={15} /> AI稼働状況</div>
          {isOpsLoading ? <p className="mt-5 text-[12px]" style={{ color: "var(--p-text-3)" }}>状態を確認中…</p> : opsError ? <p className="mt-5 text-[12px]" style={{ color: "var(--p-red)" }}>{opsError}</p> : !ops || ops.setupMissing ? <p className="mt-5 text-[12px]" style={{ color: "var(--p-amber)" }}>workerログは未設定です。運用状況からセットアップを確認してください。</p> : (
            <div className="mt-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <StatusDot color={ops.worker.status === "healthy" ? "var(--p-green)" : ops.worker.status === "stale" ? "var(--p-red)" : "var(--p-text-3)"} />
                <span className="text-[13px] font-semibold">{ops.worker.status === "healthy" ? "正常稼働" : ops.worker.status === "stale" ? "応答なし" : "状態不明"}</span>
                <span className="ml-auto text-[11px]" style={{ color: "var(--p-text-3)" }}>最終 {formatDate(ops.worker.lastHeartbeatAt)}</span>
              </div>
              {ops.currentTargets.length > 0 ? ops.currentTargets.slice(0, 2).map((target) => <div key={`${target.mode}-${target.targetPageId}`} className="rounded-[10px] p-3 text-[12px]" style={{ background: "var(--p-purple-weak)", color: "var(--p-purple)" }}><span className="approve-pulse">処理中</span> <span style={{ color: "var(--p-text)" }}>{target.targetTitle || "system"}</span> / {target.mode}</div>) : <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--p-text-3)" }}><IconRefresh size={14} /> 現在は待機中です</div>}
            </div>
          )}
        </section>
      </div>

      <section className="console-panel" aria-label="最近の処理">
        <div className="console-panel-title"><IconCalendar size={15} /> 最近の処理</div>
        {!ops || ops.recentRuns.length === 0 ? <p className="mt-4 text-[12px]" style={{ color: "var(--p-text-3)" }}>表示できるworker履歴はまだありません。</p> : <div className="mt-3 divide-y" style={{ borderColor: "var(--p-border)" }}>{ops.recentRuns.slice(0, 5).map((run) => <div key={run.id} className="grid gap-1 py-3 text-[12px] sm:grid-cols-[90px_1fr_130px]"><span style={{ color: run.status === "failed" ? "var(--p-red)" : "var(--p-green)" }}>{run.status}</span><span className="truncate">{run.targetTitle || run.mode}</span><span style={{ color: "var(--p-text-3)" }}>{formatDate(run.recordedAt ?? run.startedAt)}</span></div>)}</div>}
      </section>
    </section>
  );
}
