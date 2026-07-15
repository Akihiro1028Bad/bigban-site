import { safeExternalError } from "./externalApiError";

import type { ExternalApiErrorShape } from "./externalApiError";

export type GrowthOutcome = "success" | "partial" | "retryable-failure" | "manual-action-required";
export type GrowthStageEventName = "started" | "succeeded" | "failed" | "skipped";

export interface GrowthExternalIds {
  notionPageId?: string;
  contentId?: string;
  assetUrl?: string;
}

export interface GrowthStageEvent {
  stage: string;
  event: GrowthStageEventName;
  at: string;
  externalIds?: GrowthExternalIds;
  error?: ExternalApiErrorShape;
}

export interface GrowthRecovery {
  retryable: boolean;
  resumeFrom?: string;
  command?: string;
  manualAction?: string;
}

export interface GrowthOperationResult {
  success: boolean;
  outcome: GrowthOutcome;
  message: string;
  /** Legacy API alias. */
  error: string;
  completedStages: string[];
  failedStage?: string;
  events: GrowthStageEvent[];
  externalIds: GrowthExternalIds;
  recovery?: GrowthRecovery;
}

interface BuildGrowthOperationResultInput {
  outcome: GrowthOutcome;
  message?: string;
  completedStages?: readonly string[];
  failedStage?: string;
  events?: readonly GrowthStageEvent[];
  externalIds?: GrowthExternalIds;
  recovery?: GrowthRecovery;
  error?: unknown;
}

const OUTCOMES: readonly GrowthOutcome[] = ["success", "partial", "retryable-failure", "manual-action-required"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function idsFromEvents(events: readonly GrowthStageEvent[]): GrowthExternalIds {
  return events.reduce<GrowthExternalIds>((ids, event) => ({ ...ids, ...event.externalIds }), {});
}

export function buildGrowthOperationResult(input: BuildGrowthOperationResultInput): GrowthOperationResult {
  const events = [...(input.events ?? [])];
  if (input.error !== undefined && input.failedStage) {
    events.push({
      stage: input.failedStage,
      event: "failed",
      at: new Date().toISOString(),
      error: safeExternalError(input.error),
    });
  }
  const message = input.message ?? (input.outcome === "success" ? "完了しました。" : "処理に失敗しました。");
  return {
    success: input.outcome === "success",
    outcome: input.outcome,
    message,
    error: message,
    completedStages: [...(input.completedStages ?? [])],
    ...(input.failedStage ? { failedStage: input.failedStage } : {}),
    events,
    externalIds: { ...idsFromEvents(events), ...input.externalIds },
    ...(input.recovery ? { recovery: { ...input.recovery } } : {}),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function normalizeGrowthOperationResult(value: unknown, fallbackMessage = "応答を確認できませんでした。"): GrowthOperationResult {
  if (!isRecord(value)) return buildGrowthOperationResult({ outcome: "retryable-failure", message: fallbackMessage });
  if (typeof value.outcome === "string" && (OUTCOMES as readonly string[]).includes(value.outcome)) {
    const outcome = value.outcome as GrowthOutcome;
    return buildGrowthOperationResult({
      outcome,
      message: typeof value.message === "string" ? value.message : typeof value.error === "string" ? value.error : fallbackMessage,
      completedStages: stringArray(value.completedStages),
      failedStage: typeof value.failedStage === "string" ? value.failedStage : undefined,
      externalIds: isRecord(value.externalIds) ? {
        ...(typeof value.externalIds.notionPageId === "string" ? { notionPageId: value.externalIds.notionPageId } : {}),
        ...(typeof value.externalIds.contentId === "string" ? { contentId: value.externalIds.contentId } : {}),
        ...(typeof value.externalIds.assetUrl === "string" ? { assetUrl: value.externalIds.assetUrl } : {}),
      } : {},
      recovery: isRecord(value.recovery) && typeof value.recovery.retryable === "boolean" ? {
        retryable: value.recovery.retryable,
        ...(typeof value.recovery.resumeFrom === "string" ? { resumeFrom: value.recovery.resumeFrom } : {}),
        ...(typeof value.recovery.command === "string" ? { command: value.recovery.command } : {}),
        ...(typeof value.recovery.manualAction === "string" ? { manualAction: value.recovery.manualAction } : {}),
      } : undefined,
    });
  }
  if (typeof value.success === "boolean") {
    return buildGrowthOperationResult({
      outcome: value.success ? "success" : "retryable-failure",
      message: typeof value.error === "string" ? value.error : value.success ? "完了しました。" : fallbackMessage,
    });
  }
  return buildGrowthOperationResult({ outcome: "retryable-failure", message: fallbackMessage });
}

export function nextStageAfter(stages: readonly string[], completed: readonly string[]): string | null {
  let prefixLength = 0;
  while (prefixLength < completed.length && stages[prefixLength] === completed[prefixLength]) prefixLength += 1;
  if (prefixLength !== completed.length) return stages[0] ?? null;
  return stages[prefixLength] ?? null;
}

export function mergeGrowthOperationResults(
  primary: GrowthOperationResult,
  secondary: GrowthOperationResult,
): GrowthOperationResult {
  if (primary.outcome !== "success") return primary;
  return secondary.outcome === "success"
    ? buildGrowthOperationResult({
        outcome: "success",
        message: primary.message,
        completedStages: [...primary.completedStages, ...secondary.completedStages],
        events: [...primary.events, ...secondary.events],
        externalIds: { ...primary.externalIds, ...secondary.externalIds },
      })
    : buildGrowthOperationResult({
        outcome: secondary.outcome,
        message: secondary.message,
        completedStages: [...primary.completedStages, ...secondary.completedStages],
        failedStage: secondary.failedStage,
        events: [...primary.events, ...secondary.events],
        externalIds: { ...primary.externalIds, ...secondary.externalIds },
        recovery: secondary.recovery,
      });
}
