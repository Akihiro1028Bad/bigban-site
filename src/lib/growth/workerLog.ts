import { chunkRichText, type NotionPage } from "./notion";

export type WorkerTargetType = "article" | "proposal" | "system";
export type WorkerRunStatus = "running" | "failed" | "success" | "skipped" | "heartbeat" | "reconcile";
export type WorkerHealthStatus = "healthy" | "stale" | "unknown";

export interface CurrentWorkerTarget {
  targetPageId: string | null;
  targetTitle: string | null;
  targetType: WorkerTargetType;
  mode: string;
  status: "running" | "failed" | "success";
  startedAt: string | null;
  elapsedMs: number | null;
}

export interface WorkerRunView {
  id: string;
  mode: string;
  status: WorkerRunStatus;
  targetPageId: string | null;
  targetTitle: string | null;
  targetType: WorkerTargetType;
  startedAt: string | null;
  finishedAt: string | null;
  recordedAt: string | null;
  elapsedMs: number | null;
  exitCode: number | null;
  resumeCommand: string | null;
  detail: string | null;
}

export interface ReconcileFindingView {
  id: string;
  targetPageId: string | null;
  targetTitle: string | null;
  severity: "info" | "warning" | "error";
  detail: string;
  recordedAt: string | null;
}

export interface WorkerStatusView {
  status: WorkerHealthStatus;
  workerId: string | null;
  lastHeartbeatAt: string | null;
  currentJob: string | null;
}

export interface GrowthOpsView {
  setupMissing: boolean;
  worker: WorkerStatusView;
  currentTargets: CurrentWorkerTarget[];
  recentRuns: WorkerRunView[];
  recentFailures: WorkerRunView[];
  reconcileFindings: ReconcileFindingView[];
}

export const WORKER_LOG_PROPS = {
  title: "名前",
  kind: "種別",
  status: "ステータス",
  mode: "モード",
  worker: "Worker",
  startedAt: "開始時刻",
  finishedAt: "終了時刻",
  recordedAt: "記録時刻",
  exitCode: "終了コード",
  resumeCommand: "再開コマンド",
  targetPageId: "対象ページID",
  targetTitle: "対象タイトル",
  targetType: "対象種別",
  processName: "処理名",
  elapsedSec: "経過秒",
  detail: "詳細",
  evidenceKey: "証跡キー",
} as const;

function readTitle(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { title?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

function readRichText(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

function readSelect(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function readDate(page: NotionPage, prop: string): string | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  return value?.date?.start ?? null;
}

function readNumber(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { number?: number | null } | undefined;
  return typeof value?.number === "number" ? value.number : null;
}

function validTargetType(value: string): WorkerTargetType {
  return value === "article" || value === "proposal" || value === "system" ? value : "system";
}

function validStatus(value: string): WorkerRunStatus {
  const statuses: WorkerRunStatus[] = ["running", "failed", "success", "skipped", "heartbeat", "reconcile"];
  return statuses.includes(value as WorkerRunStatus) ? (value as WorkerRunStatus) : "skipped";
}

function elapsedMs(startedAt: string | null, finishedAt: string | null, nowMs: number): number | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  const end = finishedAt ? Date.parse(finishedAt) : nowMs;
  if (Number.isNaN(end)) return null;
  return Math.max(0, end - start);
}

export function workerRunFromPage(page: NotionPage, nowMs = Date.now()): WorkerRunView {
  const startedAt = readDate(page, WORKER_LOG_PROPS.startedAt);
  const finishedAt = readDate(page, WORKER_LOG_PROPS.finishedAt);
  return {
    id: page.id,
    mode: readRichText(page, WORKER_LOG_PROPS.mode) || readRichText(page, WORKER_LOG_PROPS.processName),
    status: validStatus(readSelect(page, WORKER_LOG_PROPS.status)),
    targetPageId: readRichText(page, WORKER_LOG_PROPS.targetPageId) || null,
    targetTitle: readRichText(page, WORKER_LOG_PROPS.targetTitle) || null,
    targetType: validTargetType(readSelect(page, WORKER_LOG_PROPS.targetType)),
    startedAt,
    finishedAt,
    recordedAt: readDate(page, WORKER_LOG_PROPS.recordedAt),
    elapsedMs: elapsedMs(startedAt, finishedAt, nowMs),
    exitCode: readNumber(page, WORKER_LOG_PROPS.exitCode),
    resumeCommand: readRichText(page, WORKER_LOG_PROPS.resumeCommand) || null,
    detail: readRichText(page, WORKER_LOG_PROPS.detail) || readTitle(page, WORKER_LOG_PROPS.title) || null,
  };
}

export function currentTargetsFromRuns(runs: readonly WorkerRunView[], nowMs = Date.now()): CurrentWorkerTarget[] {
  return runs
    .filter((run) => run.status === "running")
    .map((run) => ({
      targetPageId: run.targetPageId,
      targetTitle: run.targetTitle,
      targetType: run.targetType,
      mode: run.mode,
      status: "running",
      startedAt: run.startedAt,
      elapsedMs: elapsedMs(run.startedAt, null, nowMs),
    }));
}

export function workerStatusFromRuns(
  runs: readonly WorkerRunView[],
  nowMs = Date.now(),
  staleMs = 15 * 60 * 1000
): WorkerStatusView {
  const heartbeat = runs.find((run) => run.status === "heartbeat");
  const lastHeartbeatAt = heartbeat?.recordedAt ?? heartbeat?.startedAt ?? null;
  if (!lastHeartbeatAt) {
    return { status: "unknown", workerId: null, lastHeartbeatAt: null, currentJob: null };
  }
  const heartbeatMs = Date.parse(lastHeartbeatAt);
  const status = !Number.isNaN(heartbeatMs) && nowMs - heartbeatMs <= staleMs ? "healthy" : "stale";
  const current = runs.find((run) => run.status === "running");
  return {
    status,
    workerId: heartbeat?.detail ?? null,
    lastHeartbeatAt,
    currentJob: current?.mode ?? null,
  };
}

export function reconcileFindingFromPage(page: NotionPage): ReconcileFindingView {
  const severity = readSelect(page, WORKER_LOG_PROPS.kind);
  return {
    id: page.id,
    targetPageId: readRichText(page, WORKER_LOG_PROPS.targetPageId) || null,
    targetTitle: readRichText(page, WORKER_LOG_PROPS.targetTitle) || null,
    severity: severity === "error" || severity === "warning" || severity === "info" ? severity : "warning",
    detail: readRichText(page, WORKER_LOG_PROPS.detail) || readTitle(page, WORKER_LOG_PROPS.title),
    recordedAt: readDate(page, WORKER_LOG_PROPS.recordedAt),
  };
}

export function growthOpsViewFromPages(
  pages: readonly NotionPage[],
  nowMs = Date.now(),
  staleMs = 15 * 60 * 1000
): GrowthOpsView {
  const runs = pages.map((page) => workerRunFromPage(page, nowMs));
  const reconcileFindings = pages
    .filter((page) => readSelect(page, WORKER_LOG_PROPS.status) === "reconcile")
    .map(reconcileFindingFromPage);
  return {
    setupMissing: false,
    worker: workerStatusFromRuns(runs, nowMs, staleMs),
    currentTargets: currentTargetsFromRuns(runs, nowMs),
    recentRuns: runs.filter((run) => run.status !== "heartbeat" && run.status !== "reconcile"),
    recentFailures: runs.filter((run) => run.status === "failed"),
    reconcileFindings,
  };
}

export interface WorkerLogPropsInput {
  name: string;
  kind: string;
  status: WorkerRunStatus;
  mode: string;
  workerId: string;
  targetPageId?: string | null;
  targetTitle?: string | null;
  targetType?: WorkerTargetType;
  startedAt?: string | null;
  finishedAt?: string | null;
  recordedAt: string;
  exitCode?: number | null;
  resumeCommand?: string | null;
  detail?: string | null;
  evidenceKey?: string | null;
}

export function buildWorkerLogProps(input: WorkerLogPropsInput): Record<string, unknown> {
  return {
    [WORKER_LOG_PROPS.title]: { title: chunkRichText(input.name) },
    [WORKER_LOG_PROPS.kind]: { select: { name: input.kind } },
    [WORKER_LOG_PROPS.status]: { select: { name: input.status } },
    [WORKER_LOG_PROPS.mode]: { rich_text: chunkRichText(input.mode) },
    [WORKER_LOG_PROPS.worker]: { rich_text: chunkRichText(input.workerId) },
    [WORKER_LOG_PROPS.targetPageId]: { rich_text: chunkRichText(input.targetPageId ?? "") },
    [WORKER_LOG_PROPS.targetTitle]: { rich_text: chunkRichText(input.targetTitle ?? "") },
    [WORKER_LOG_PROPS.targetType]: { select: { name: input.targetType ?? "system" } },
    [WORKER_LOG_PROPS.processName]: { rich_text: chunkRichText(input.mode) },
    [WORKER_LOG_PROPS.startedAt]: input.startedAt ? { date: { start: input.startedAt } } : { date: null },
    [WORKER_LOG_PROPS.finishedAt]: input.finishedAt ? { date: { start: input.finishedAt } } : { date: null },
    [WORKER_LOG_PROPS.recordedAt]: { date: { start: input.recordedAt } },
    [WORKER_LOG_PROPS.exitCode]: { number: input.exitCode ?? null },
    [WORKER_LOG_PROPS.resumeCommand]: { rich_text: chunkRichText(input.resumeCommand ?? "") },
    [WORKER_LOG_PROPS.detail]: { rich_text: chunkRichText(input.detail ?? "") },
    [WORKER_LOG_PROPS.evidenceKey]: { rich_text: chunkRichText(input.evidenceKey ?? "") },
  };
}
