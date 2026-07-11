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
});
