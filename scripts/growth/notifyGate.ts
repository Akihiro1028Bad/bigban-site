import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type NotifyKind = "weekly" | "routine" | "failure";
export type NotifyLevel = "weekly-only" | "all";

export const FAILURE_LOG_PATH = "data/growth-failures.log";
export const FAILURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface AppendFailureLogDeps {
  appendFileSync?: (filePath: string, data: string, encoding: BufferEncoding) => void;
  mkdirSync?: (filePath: string, options: { recursive: true }) => void;
  filePath?: string;
}

export function resolveNotifyLevel(env: Record<string, string | undefined>): NotifyLevel {
  const raw = env.GROWTH_NOTIFY_LEVEL?.toLowerCase();
  return raw === "all" || raw === "normal" || raw === "verbose" ? "all" : "weekly-only";
}

export function shouldPushLine(kind: NotifyKind, level: NotifyLevel): boolean {
  return level === "all" || kind === "weekly";
}

function cleanField(value: string | number): string {
  return String(value).replace(/[\t\r\n]+/g, " ").trim();
}

// Keep this format mirrored with scripts/growth/run.mjs (formatFailureLogEntry).
export function formatFailureLogEntry(input: {
  nowIso: string;
  source: string;
  exitCode?: number | string;
  resume?: string;
  detail?: string;
}): string {
  const parts = [`source=${cleanField(input.source)}`];
  if (input.exitCode !== undefined) parts.push(`exit=${cleanField(input.exitCode)}`);
  if (input.resume) parts.push(`resume=${cleanField(input.resume)}`);
  if (input.detail) parts.push(`detail=${cleanField(input.detail)}`);
  return [input.nowIso, ...parts].join("\t");
}

export function countRecentFailures(logText: string, windowMs: number, now: number): number {
  if (!logText) return 0;
  return logText
    .split("\n")
    .filter((line) => {
      const [iso] = line.split("\t", 1);
      const time = Date.parse(iso);
      return Number.isFinite(time) && now - time <= windowMs && now >= time;
    }).length;
}

export function buildFailureSummaryLine(count: number, logPath: string): string {
  return count > 0 ? `今週の失敗 ${count}件（詳細: ${logPath}）` : "";
}

export function appendFailureLog(line: string, deps: AppendFailureLogDeps = {}): void {
  const filePath = deps.filePath ?? FAILURE_LOG_PATH;
  const write = deps.appendFileSync ?? appendFileSync;
  const makeDir = deps.mkdirSync ?? mkdirSync;
  makeDir(path.dirname(filePath), { recursive: true });
  write(filePath, `${line}\n`, "utf-8");
}
