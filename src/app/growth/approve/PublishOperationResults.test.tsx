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

  it("Notion同期・全体再試行を区別し、retryable:falseにはボタンを出さない", () => {
    const onRetry = vi.fn();
    render(<PublishOperationResults results={[
      { pageId: "notion", title: "Notion記事", result: buildGrowthOperationResult({ outcome: "partial", recovery: { retryable: true, resumeFrom: "notion:status" } }) },
      { pageId: "publish", title: "公開記事", result: buildGrowthOperationResult({ outcome: "retryable-failure", recovery: { retryable: true, resumeFrom: "microcms:publish" } }) },
      { pageId: "manual", title: "手動記事", result: buildGrowthOperationResult({ outcome: "manual-action-required", recovery: { retryable: false, resumeFrom: "notion:status" } }) },
    ]} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Notion記事: Notion同期のみ再試行" }));
    fireEvent.click(screen.getByRole("button", { name: "公開記事: 公開処理を再試行" }));
    expect(onRetry).toHaveBeenNthCalledWith(1, "notion", "notion:status");
    expect(onRetry).toHaveBeenNthCalledWith(2, "publish");
    expect(screen.queryByRole("button", { name: /手動記事/ })).not.toBeInTheDocument();
  });
});
