export type ProcessResultKind = "success" | "nonzero-exit" | "spawn-error" | "signal" | "timeout" | "lease-lost" | "max-buffer";

export interface ProcessResult {
  kind: ProcessResultKind;
  exitCode: number;
  phase: string;
  elapsedMs: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  termSent: boolean;
  forceKilled: boolean;
  error?: Error;
}

export interface RunProcessOptions {
  timeoutMs: number;
  phase?: string;
  killGraceMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  stdin?: string;
  stdio?: "inherit" | "capture";
  maxBuffer?: number;
  heartbeat?: () => boolean | void | Promise<boolean | void>;
  heartbeatMs?: number;
}

export interface TimeoutPolicy {
  controlMs: number;
  pullLoopMs: number;
  weeklyMs: number;
  initiativesMs: number;
  imagePromptMs: number;
  draftsMs: number;
  draftResearchMs: number;
  draftWriteMs: number;
  publishDraftMs: number;
  daemonDataMs: number;
  killGraceMs: number;
  lockHeartbeatMs: number;
  lockLeaseMs: number;
  daemonHeartbeatMs: number;
  runModeTimeouts: Readonly<Record<string, number>>;
  draftPhaseTimeouts: Readonly<Record<string, number>>;
}

export interface ProcessFailureContext {
  jobId: string;
  timeoutMs: number;
  resumeCommand: string;
}

export interface ProcessCloseState {
  leaseLost: boolean;
  timedOut: boolean;
  bufferExceeded: boolean;
  isWrapper: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}

export interface WindowsTerminationDependencies {
  runTaskkill(args: readonly string[]): Promise<boolean>;
  wait(ms: number): Promise<void>;
}

export interface TaskkillChild {
  once(event: "error", listener: (error: Error) => void): TaskkillChild;
  once(event: "close", listener: () => void): TaskkillChild;
}

export type TaskkillSpawner = (
  command: string,
  args: readonly string[],
  options: { stdio: "ignore"; windowsHide: true },
) => TaskkillChild;

export interface WindowsTerminationResult {
  termSent: boolean;
  forceKilled: boolean;
}

export function resolveTimeoutPolicy(env?: Record<string, string | undefined>): TimeoutPolicy;
export function buildProcessFailureDetail(result: ProcessResult, context: ProcessFailureContext): string;
export function classifyProcessClose(state: ProcessCloseState): ProcessResultKind;
export function createTaskkillRunner(spawnTaskkill: TaskkillSpawner): (args: readonly string[]) => Promise<boolean>;
export function parseProcessGroupRegistry(records: string): ReadonlyMap<number, number | null>;
export function runProcess(command: string, args: readonly string[], options: RunProcessOptions): Promise<ProcessResult>;
export function startPeriodicTask(task: () => void | Promise<void>, intervalMs: number, options?: { runImmediately?: boolean }): () => void;
export function terminateWindowsProcessTree(
  pid: number,
  killGraceMs: number,
  leaderClose: Promise<void>,
  dependencies: WindowsTerminationDependencies,
): Promise<WindowsTerminationResult>;
export function waitForDelay(ms: number): Promise<void>;
