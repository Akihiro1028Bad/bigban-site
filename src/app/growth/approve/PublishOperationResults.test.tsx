import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildGrowthOperationResult } from "@/lib/growth/operationOutcome";

import { PublishOperationResults } from "./PublishOperationResults";

describe("PublishOperationResults", () => {
  it("4outcomeを集計して記事別の詳細と復旧文を表示する", () => {
    const onRetry = vi.fn();
    const outcomes = ["success", "partial", "retryable-failure", "manual-action-required"] as const;
    render(<PublishOperationResults results={outcomes.map((outcome, index) => ({
      pageId: `p${index}`,
      title: `記事${index}`,
      result: buildGrowthOperationResult({
        outcome,
        message: `message-${outcome}`,
        completedStages: ["read"],
        failedStage: outcome === "success" ? undefined : "write",
        recovery: outcome === "partial" ? { retryable: true, resumeFrom: "notion:status", manualAction: "Notionを手動確認してください。" } : undefined,
      }),
    }))} onRetry={onRetry} />);

    for (const outcome of outcomes) expect(screen.getByLabelText(`${outcome}: 1件`)).toBeInTheDocument();
    expect(screen.getByText("Notionを手動確認してください。")).toBeInTheDocument();
    expect(screen.getAllByText(/完了: read/)).toHaveLength(4);
    expect(screen.getAllByText(/失敗: write/)).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /Notion同期のみ再試行/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /記事1.*Notion同期のみ再試行/ }));
    expect(onRetry).toHaveBeenCalledWith("p1", "notion:status");
    expect(screen.queryByRole("button", { name: /記事0.*再試行/ })).not.toBeInTheDocument();
  });
});
