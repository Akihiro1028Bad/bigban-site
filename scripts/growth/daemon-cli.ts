import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  buildJobs,
  lastRunAfterAttempt,
  msUntilNextDue,
  restoreLastRun,
  selectDueJobs,
  type DaemonJob,
} from "./daemonSchedule";
import { buildProcessFailureDetail, resolveTimeoutPolicy, runProcess, startPeriodicTask } from "./processControl.mjs";
import type { ProcessResult } from "./processControl.mjs";
import { runDaemonSmoke } from "./daemonSmoke";

const MIN_SLEEP_MS = 1_000;
const MAX_SLEEP_MS = 60_000;
const LAST_RUN_PATH = join(process.cwd(), ".growth-tmp", "daemon-last-run.json");
const timeoutPolicy = resolveTimeoutPolicy(process.env);
const FAILURE_LOG_PATH = join(process.cwd(), "data", "growth-failures.log");

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

async function runScript(job: DaemonJob, jobId: string): Promise<ProcessResult> {
  const result = await runProcess(process.platform === "win32" ? "npm.cmd" : "npm", ["run", job.script], {
    timeoutMs: jobTimeoutMs(job),
    killGraceMs: timeoutPolicy.killGraceMs,
    phase: `daemon:${job.name}`,
    env: { ...process.env, GROWTH_JOB_ID: jobId },
    shell: true,
    stdio: "inherit",
  });
  if (result.kind === "spawn-error") process.stderr.write(`[${timestamp()}] ${job.name} 起動失敗: ${result.error?.message ?? "unknown"}\n`);
  return result;
}

async function recordTimeoutEvidence(job: DaemonJob, jobId: string, result: ProcessResult): Promise<void> {
  if (result.kind !== "timeout") return;
  const timeoutMs = jobTimeoutMs(job);
  const resumeCommand = `npm run ${job.script}`;
  const detail = buildProcessFailureDetail(result, { jobId, timeoutMs, resumeCommand });
  mkdirSync(dirname(FAILURE_LOG_PATH), { recursive: true });
  appendFileSync(FAILURE_LOG_PATH, `${new Date().toISOString()}\tsource=daemon:${job.name}\texit=124\tresume=${resumeCommand}\tdetail=${detail}\n`, "utf8");

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await runProcess(npm, ["run", "--silent", "growth:worker-log", "--", "start", "--mode", job.name, "--status", "failed", "--kind", "job", "--name", `${job.name} timeout`, "--target-type", "system", "--job-id", jobId, "--exit-code", "124", "--detail", detail, "--resume", resumeCommand], {
    timeoutMs: timeoutPolicy.controlMs, phase: "daemon-timeout-worker-log", stdio: "capture", shell: process.platform === "win32", env: { ...process.env, GROWTH_JOB_ID: jobId },
  });
  await runProcess(npm, ["run", "growth:learning-log", "--", "append-fail", `daemon:${job.name}`, "124", detail], {
    timeoutMs: timeoutPolicy.controlMs, phase: "daemon-timeout-learning-log", stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, GROWTH_JOB_ID: jobId },
  });
  await runProcess(npm, ["run", "growth:notify-loop-fail"], {
    timeoutMs: timeoutPolicy.controlMs,
    phase: "daemon-timeout-notify",
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      GROWTH_JOB_ID: jobId,
      GROWTH_LOOP_MODE: `daemon:${job.name}`,
      GROWTH_LOOP_RESUME: resumeCommand,
      GROWTH_LOOP_KIND: "timeout",
      GROWTH_LOOP_EXIT: "124",
      GROWTH_LOOP_DETAIL: detail,
      GROWTH_LOOP_TIMEOUT_MS: String(timeoutMs),
      GROWTH_LOOP_TERM_SENT: String(result.termSent),
      GROWTH_LOOP_FORCE_KILLED: String(result.forceKilled),
    },
  });
}

async function main(): Promise<void> {
  if (process.argv.includes("--smoke")) {
    const statePath = process.env.GROWTH_DAEMON_SMOKE_STATE_PATH
      ?? join(process.cwd(), ".growth-tmp", "daemon-smoke.json");
    const result = await runDaemonSmoke(statePath, process.platform, {
      runProcess: async (command, args) => runProcess(command, args, {
        timeoutMs: timeoutPolicy.controlMs,
        phase: "daemon-smoke",
        stdio: "capture",
        shell: process.platform === "win32",
      }),
      readText: (filePath) => readFile(filePath, "utf8"),
      makeDirectory: async (directoryPath) => { await mkdir(directoryPath, { recursive: true }); },
      writeText: (filePath, value) => writeFile(filePath, value, "utf8"),
      rename,
      now: () => new Date(),
    });
    log(`[daemon-smoke] ${result.isSuccess ? "成功" : "失敗"}; 前回状態${result.hadPreviousState ? "あり" : "なし"}; npm=${result.npmVersion}`);
    process.exit(result.isSuccess ? 0 : 1);
  }

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
      const result = await runScript(job, jobId);
      stopHeartbeat();
      await recordTimeoutEvidence(job, jobId, result);
      const exitCode = result.exitCode;
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
