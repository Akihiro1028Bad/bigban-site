import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DashboardView } from "./DashboardView";

describe("DashboardView", () => {
  it("4つの対応カードとパイプラインを表示し、カードから遷移する", async () => {
    const onNavigate = vi.fn();
    render(
      <DashboardView
        summary={{
          proposalPending: 2,
          articleAwaiting: 3,
          publishReady: 1,
          publishBlocked: 4,
          pipeline: { proposals: 5, production: 6, publishWaiting: 2, published: 7 },
        }}
        ops={null}
        isOpsLoading={false}
        opsError={null}
        onNavigate={onNavigate}
        onAddProposal={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "今日の編集司令室" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /未処理施策/ })).toHaveTextContent("2");
    expect(screen.getByText("記事制作")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /公開可能/ }));
    expect(onNavigate).toHaveBeenCalledWith("queue");
    await userEvent.click(screen.getByRole("button", { name: /記事のアクション待ち/ }));
    expect(onNavigate).toHaveBeenCalledWith("approve", "awaiting");
  });

  it("worker未設定を明示する", () => {
    render(
      <DashboardView
        summary={{ proposalPending: 0, articleAwaiting: 0, publishReady: 0, publishBlocked: 0, pipeline: { proposals: 0, production: 0, publishWaiting: 0, published: 0 } }}
        ops={{ setupMissing: true, worker: { status: "unknown", workerId: null, lastHeartbeatAt: null, currentJob: null }, currentTargets: [], recentRuns: [], recentFailures: [], reconcileFindings: [] }}
        isOpsLoading={false}
        opsError={null}
        onNavigate={vi.fn()}
        onAddProposal={vi.fn()}
      />,
    );
    expect(screen.getByText(/workerログは未設定/)).toBeInTheDocument();
  });

  it("操作カード・パイプライン・施策追加をすべて結線する", async () => {
    const onNavigate = vi.fn();
    const onAddProposal = vi.fn();
    render(
      <DashboardView
        summary={{ proposalPending: 0, articleAwaiting: 0, publishReady: 0, publishBlocked: 1, pipeline: { proposals: 1, production: 2, publishWaiting: 3, published: 4 } }}
        ops={null}
        isOpsLoading
        opsError={null}
        onNavigate={onNavigate}
        onAddProposal={onAddProposal}
      />,
    );
    expect(screen.getByText("状態を確認中…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /施策を追加/ }));
    await userEvent.click(screen.getByRole("button", { name: /未処理施策/ }));
    await userEvent.click(screen.getByRole("button", { name: /要対応/ }));
    await userEvent.click(screen.getByRole("button", { name: /^施策/ }));
    await userEvent.click(screen.getByRole("button", { name: /記事制作$/ }));
    await userEvent.click(screen.getByRole("button", { name: /公開待ち$/ }));
    await userEvent.click(screen.getByRole("button", { name: /公開済み$/ }));
    expect(onAddProposal).toHaveBeenCalled();
    expect(onNavigate.mock.calls).toEqual(expect.arrayContaining([["queue"], ["approve"], ["performance"]]));
  });

  it("worker状態・処理対象・履歴とエラー表示を描画する", () => {
    const base = {
      setupMissing: false,
      worker: { status: "healthy" as const, workerId: "w", lastHeartbeatAt: "2026-07-11T00:00:00Z", currentJob: null },
      currentTargets: [{ targetPageId: "p", targetTitle: null, targetType: "system" as const, mode: "drafts", status: "running" as const, startedAt: null, elapsedMs: 1 }],
      recentRuns: [{ id: "r", mode: "drafts", status: "failed" as const, targetPageId: "p", targetTitle: null, targetType: "system" as const, startedAt: "invalid", finishedAt: null, recordedAt: null, elapsedMs: null, exitCode: 1, resumeCommand: null, detail: null }],
      recentFailures: [],
      reconcileFindings: [],
    };
    const { rerender } = render(
      <DashboardView summary={{ proposalPending: 0, articleAwaiting: 0, publishReady: 0, publishBlocked: 0, pipeline: { proposals: 0, production: 0, publishWaiting: 0, published: 0 } }} ops={base} isOpsLoading={false} opsError={null} onNavigate={vi.fn()} onAddProposal={vi.fn()} />,
    );
    expect(screen.getByText("正常稼働")).toBeInTheDocument();
    expect(screen.getByText("system")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    rerender(<DashboardView summary={{ proposalPending: 0, articleAwaiting: 0, publishReady: 0, publishBlocked: 0, pipeline: { proposals: 0, production: 0, publishWaiting: 0, published: 0 } }} ops={{ ...base, worker: { ...base.worker, status: "stale" }, currentTargets: [], recentRuns: [] }} isOpsLoading={false} opsError="取得失敗" onNavigate={vi.fn()} onAddProposal={vi.fn()} />);
    expect(screen.getByText("取得失敗")).toBeInTheDocument();
  });

  it("状態不明・待機中・正常終了履歴を表示する", () => {
    const { rerender } = render(<DashboardView
      summary={{ proposalPending: 0, articleAwaiting: 0, publishReady: 0, publishBlocked: 0, pipeline: { proposals: 0, production: 0, publishWaiting: 0, published: 0 } }}
      ops={{
        setupMissing: false,
        worker: { status: "unknown", workerId: "w", lastHeartbeatAt: null, currentJob: null },
        currentTargets: [],
        recentRuns: [{ id: "ok", mode: "weekly", status: "completed", targetPageId: null, targetTitle: "週次処理", targetType: "system", startedAt: "2026-07-11T00:00:00Z", finishedAt: null, recordedAt: "2026-07-11T01:00:00Z", elapsedMs: null, exitCode: 0, resumeCommand: null, detail: null }],
        recentFailures: [],
        reconcileFindings: [],
      }}
      isOpsLoading={false}
      opsError={null}
      onNavigate={vi.fn()}
      onAddProposal={vi.fn()}
    />);
    expect(screen.getByText("状態不明")).toBeInTheDocument();
    expect(screen.getByText("現在は待機中です")).toBeInTheDocument();
    expect(screen.getByText("週次処理")).toBeInTheDocument();
    rerender(<DashboardView
      summary={{ proposalPending: 0, articleAwaiting: 0, publishReady: 0, publishBlocked: 0, pipeline: { proposals: 0, production: 0, publishWaiting: 0, published: 0 } }}
      ops={{ setupMissing: false, worker: { status: "stale", workerId: "w", lastHeartbeatAt: null, currentJob: null }, currentTargets: [], recentRuns: [], recentFailures: [], reconcileFindings: [] }}
      isOpsLoading={false} opsError={null} onNavigate={vi.fn()} onAddProposal={vi.fn()}
    />);
    expect(screen.getByText("応答なし")).toBeInTheDocument();
  });
});
