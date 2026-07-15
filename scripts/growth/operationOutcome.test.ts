import { describe, expect, it } from "vitest";

import {
  buildGrowthOperationResult,
  mergeGrowthOperationResults,
  nextStageAfter,
  normalizeGrowthOperationResult,
  type GrowthStageEvent,
} from "./operationOutcome";

describe("operationOutcome", () => {
  const events: GrowthStageEvent[] = [
    { stage: "read", event: "started", at: "2026-07-15T00:00:00.000Z" },
    { stage: "read", event: "succeeded", at: "2026-07-15T00:00:01.000Z", externalIds: { notionPageId: "page" } },
  ];

  it.each(["success", "partial", "retryable-failure", "manual-action-required"] as const)(
    "%s outcome を構築し success は完全成功だけ true にする",
    (outcome) => {
      const result = buildGrowthOperationResult({ outcome, message: "result", completedStages: ["read"], events });
      expect(result.success).toBe(outcome === "success");
      expect(result.error).toBe("result");
      expect(result.events).toEqual(events);
      expect(result.externalIds).toEqual({ notionPageId: "page" });
    },
  );

  it("legacy success/error と非JSON・不正スキーマを安全に正規化する", () => {
    expect(normalizeGrowthOperationResult({ success: true })).toMatchObject({ outcome: "success", success: true });
    expect(normalizeGrowthOperationResult({ success: false, error: "legacy" })).toMatchObject({ outcome: "retryable-failure", message: "legacy" });
    expect(normalizeGrowthOperationResult("not-json")).toMatchObject({ outcome: "retryable-failure", success: false });
    expect(normalizeGrowthOperationResult({ outcome: "bad", token: "secret" })).not.toHaveProperty("token");
    expect(normalizeGrowthOperationResult({ success: false })).toMatchObject({ outcome: "retryable-failure", message: "応答を確認できませんでした。" });
  });

  it("構造化envelopeの任意フィールドを検証して正規化する", () => {
    const normalized = normalizeGrowthOperationResult({
      outcome: "partial",
      error: "alias",
      completedStages: ["read", 1],
      failedStage: "write",
      externalIds: { notionPageId: "page", contentId: "content", assetUrl: "asset", ignored: "x" },
      recovery: { retryable: true, resumeFrom: "write", command: "retry", manualAction: "manual" },
    });
    expect(normalized).toMatchObject({
      message: "alias",
      completedStages: ["read"],
      failedStage: "write",
      externalIds: { notionPageId: "page", contentId: "content", assetUrl: "asset" },
      recovery: { retryable: true, resumeFrom: "write", command: "retry", manualAction: "manual" },
    });
    expect(normalizeGrowthOperationResult({ outcome: "partial", externalIds: "bad", recovery: { retryable: "yes" } })).toMatchObject({ externalIds: {} });
    expect(normalizeGrowthOperationResult({ outcome: "partial", externalIds: { notionPageId: 1, contentId: 2, assetUrl: 3 }, recovery: { retryable: false } })).toMatchObject({ recovery: { retryable: false } });
  });

  it("外部エラーは構造化情報だけ保持し secret や本文を保持しない", () => {
    const result = buildGrowthOperationResult({
      outcome: "retryable-failure",
      message: "safe",
      failedStage: "publish",
      error: new Error("token=secret <html>body</html>"),
      events: [],
    });
    expect(result.events[0]?.error).toEqual({ operation: "external.unknown", status: null, requestId: "unknown" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("body");
  });

  it("完了prefixから次stageを選ぶ", () => {
    expect(nextStageAfter(["read", "sync", "publish"], ["read", "sync"])).toBe("publish");
    expect(nextStageAfter(["read"], ["read"])).toBeNull();
    expect(nextStageAfter(["read", "sync"], ["sync"])).toBe("read");
    expect(nextStageAfter([], ["missing"])).toBeNull();
  });

  it("publish successと通知partialをマージし、publish partialは通知結果で上書きしない", () => {
    const success = buildGrowthOperationResult({ outcome: "success", completedStages: ["create"] });
    const partial = buildGrowthOperationResult({ outcome: "partial", failedStage: "line-notify", recovery: { retryable: true, command: "retry" } });
    expect(mergeGrowthOperationResults(success, partial)).toMatchObject({ outcome: "partial", completedStages: ["create"], failedStage: "line-notify" });
    expect(mergeGrowthOperationResults(partial, success)).toBe(partial);
    expect(mergeGrowthOperationResults(success, success)).toMatchObject({ outcome: "success", completedStages: ["create", "create"] });
  });
});
