import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  buildJobs,
  lastRunAfterAttempt,
  msUntilNextDue,
  restoreLastRun,
  selectDueJobs,
  type DaemonJob,
} from "./daemonSchedule";
import { resolveTimeoutPolicy, runProcess, startPeriodicTask } from "./processControl.mjs";

const MIN_SLEEP_MS = 1_000;
const MAX_SLEEP_MS = 60_000;
const LAST_RUN_PATH = join(process.cwd(), ".growth-tmp", "daemon-last-run.json");
const timeoutPolicy = resolveTimeoutPolicy(process.env);

let isStopping = false;
let wakeSleep: (() => void) | null = null;

function timestamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function loadLastRun(): unknown {
  try {
    return JSON.parse(readFileSync(LAST_RUN_PATH, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function saveLastRun(lastRun: Readonly<Record<string, number>>): void {
  mkdirSync(dirname(LAST_RUN_PATH), { recursive: true });
  const temporaryPath = `${LAST_RUN_PATH}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(lastRun)}\n`, "utf8");
  renameSync(temporaryPath, LAST_RUN_PATH);
}

async function writeHeartbeat(detail: string, currentJob = "", jobId = ""): Promise<void> {
  const args = [
    "run",
    "--silent",
    "growth:worker-log",
    "--",
    "heartbeat",
    "--mode",
    currentJob || "daemon",
    "--name",
    `daemon ${detail}`,
    "--detail",
    detail,
    "--target-type",
    "system",
    "--job-id",
    jobId,
  ];
  await runProcess(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    timeoutMs: timeoutPolicy.controlMs,
    phase: "daemon-worker-heartbeat",
    env: { ...process.env, ...(jobId ? { GROWTH_JOB_ID: jobId } : {}) },
    shell: true,
    stdio: "capture",
  });
}

function clampSleep(ms: number): number {
  return Math.min(MAX_SLEEP_MS, Math.max(MIN_SLEEP_MS, ms));
}

function installSignalHandlers(): void {
  const requestStop = (): void => {
    if (!isStopping) log("停止中...現在のジョブ完了後に終了");
    isStopping = true;
    wakeSleep?.();
  };

  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakeSleep = null;
      resolve();
    }, ms);

    wakeSleep = () => {
      clearTimeout(timer);
      wakeSleep = null;
      resolve();
    };
  });
}

function jobTimeoutMs(job: DaemonJob): number {
  if (job.name === "drafts-auto") return timeoutPolicy.draftsMs;
  if (job.name === "initiatives-auto") return timeoutPolicy.initiativesMs;
  if (["revise", "regen", "regen-body", "advise", "decorate", "advise-apply", "comment-revise"].includes(job.name)) return timeoutPolicy.pullLoopMs;
  return timeoutPolicy.daemonDataMs;
}

async function runScript(job: DaemonJob, jobId: string): Promise<number> {
  const result = await runProcess(process.platform === "win32" ? "npm.cmd" : "npm", ["run", job.script], {
    timeoutMs: jobTimeoutMs(job),
    killGraceMs: timeoutPolicy.killGraceMs,
    phase: `daemon:${job.name}`,
    env: { ...process.env, GROWTH_JOB_ID: jobId },
    shell: true,
    stdio: "inherit",
  });
  if (result.kind === "spawn-error") process.stderr.write(`[${timestamp()}] ${job.name} 起動失敗: ${result.error?.message ?? "unknown"}\n`);
  return result.exitCode;
}

async function main(): Promise<void> {
  installSignalHandlers();

  const jobs = buildJobs(process.env);
  const lastRun = restoreLastRun(jobs, loadLastRun(), Date.now());
  saveLastRun(lastRun);

  log("growth daemon jobs:");
  for (const job of jobs) {
    log(`- ${job.name}: npm run ${job.script} every ${job.everyMs}ms`);
  }
  log("Ctrl+C で停止");
  await writeHeartbeat("started");

  while (!isStopping) {
    const due = selectDueJobs(jobs, lastRun, Date.now());

    for (const job of due) {
      if (isStopping) break;

      log(`[${timestamp()}] ▶ ${job.name}`);
      const jobId = randomUUID();
      await writeHeartbeat("running", job.name, jobId);
      const stopHeartbeat = startPeriodicTask(
        () => writeHeartbeat("running", job.name, jobId),
        timeoutPolicy.daemonHeartbeatMs,
      );
      const exitCode = await runScript(job, jobId);
      stopHeartbeat();
      const mark = exitCode === 0 ? "✓" : "✗";
      log(`[${timestamp()}] ${mark} ${job.name} (exit ${exitCode})`);
      await writeHeartbeat(`idle exit=${exitCode}`, job.name, jobId);
      lastRun[job.name] = lastRunAfterAttempt(job, Date.now(), exitCode === 0);
      saveLastRun(lastRun);
    }

    if (isStopping) break;

    const sleepMs = clampSleep(msUntilNextDue(jobs, lastRun, Date.now()));
    await sleep(sleepMs);
  }

  await writeHeartbeat("stopping");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("[growth:daemon] 失敗:", error);
  process.exit(1);
});
