import { spawn } from "node:child_process";
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

const MIN_SLEEP_MS = 1_000;
const MAX_SLEEP_MS = 60_000;
const LAST_RUN_PATH = join(process.cwd(), ".growth-tmp", "daemon-last-run.json");

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

function writeHeartbeat(detail: string, currentJob = ""): void {
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
  ];
  const child = spawn("npm", args, {
    env: process.env,
    shell: true,
    stdio: "ignore",
  });
  child.on("error", () => undefined);
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

function runScript(job: DaemonJob): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", job.script], {
      env: process.env,
      shell: true,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      process.stderr.write(`[${timestamp()}] ${job.name} 起動失敗: ${String(error)}\n`);
      resolve(1);
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
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
  writeHeartbeat("started");

  while (!isStopping) {
    const due = selectDueJobs(jobs, lastRun, Date.now());

    for (const job of due) {
      if (isStopping) break;

      log(`[${timestamp()}] ▶ ${job.name}`);
      writeHeartbeat("running", job.name);
      const exitCode = await runScript(job);
      const mark = exitCode === 0 ? "✓" : "✗";
      log(`[${timestamp()}] ${mark} ${job.name} (exit ${exitCode})`);
      writeHeartbeat(`idle exit=${exitCode}`, job.name);
      lastRun[job.name] = lastRunAfterAttempt(job, Date.now(), exitCode === 0);
      saveLastRun(lastRun);
    }

    if (isStopping) break;

    const sleepMs = clampSleep(msUntilNextDue(jobs, lastRun, Date.now()));
    await sleep(sleepMs);
  }

  writeHeartbeat("stopping");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("[growth:daemon] 失敗:", error);
  process.exit(1);
});
