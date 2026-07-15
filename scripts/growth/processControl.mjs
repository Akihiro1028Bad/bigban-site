import { spawn } from "node:child_process";

const PROCESS_GROUP_ENV = "GROWTH_PROCESS_GROUP_ID";
const ROOT_LAUNCHER = `
const { spawn } = require("node:child_process");
const command = process.argv[1];
const args = process.argv.slice(2);
const child = spawn(command, args, {
  cwd: process.cwd(),
  env: { ...process.env, ${JSON.stringify(PROCESS_GROUP_ENV)}: String(process.pid) },
  shell: process.env.GROWTH_PROCESS_GROUP_SHELL === "1",
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => { process.stderr.write("GROWTH_SPAWN_ERROR:" + error.message + "\\n"); process.exit(126); });
child.on("close", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
`;

const DEFAULTS = Object.freeze({
  controlMs: 2 * 60 * 1000,
  pullLoopMs: 60 * 60 * 1000,
  weeklyMs: 120 * 60 * 1000,
  initiativesMs: 90 * 60 * 1000,
  imagePromptMs: 45 * 60 * 1000,
  draftsMs: 300 * 60 * 1000,
  draftResearchMs: 60 * 60 * 1000,
  draftWriteMs: 90 * 60 * 1000,
  publishDraftMs: 90 * 60 * 1000,
  daemonDataMs: 30 * 60 * 1000,
  killGraceMs: 15 * 1000,
  lockHeartbeatMs: 60 * 1000,
  lockLeaseMs: 15 * 60 * 1000,
  daemonHeartbeatMs: 5 * 60 * 1000,
});

function positiveFinite(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveTimeoutPolicy(env = process.env) {
  const policy = {
    controlMs: positiveFinite(env.GROWTH_TIMEOUT_CONTROL_MS, DEFAULTS.controlMs),
    pullLoopMs: positiveFinite(env.GROWTH_TIMEOUT_PULL_LOOP_MS, DEFAULTS.pullLoopMs),
    weeklyMs: positiveFinite(env.GROWTH_TIMEOUT_WEEKLY_MS, DEFAULTS.weeklyMs),
    initiativesMs: positiveFinite(env.GROWTH_TIMEOUT_INITIATIVES_MS, DEFAULTS.initiativesMs),
    imagePromptMs: positiveFinite(env.GROWTH_TIMEOUT_IMAGE_PROMPT_MS, DEFAULTS.imagePromptMs),
    draftsMs: positiveFinite(env.GROWTH_TIMEOUT_DRAFTS_MS, DEFAULTS.draftsMs),
    draftResearchMs: positiveFinite(env.GROWTH_TIMEOUT_DRAFT_RESEARCH_MS, DEFAULTS.draftResearchMs),
    draftWriteMs: positiveFinite(env.GROWTH_TIMEOUT_DRAFT_WRITE_MS, DEFAULTS.draftWriteMs),
    publishDraftMs: positiveFinite(env.GROWTH_TIMEOUT_PUBLISH_DRAFT_MS, DEFAULTS.publishDraftMs),
    daemonDataMs: positiveFinite(env.GROWTH_TIMEOUT_DAEMON_DATA_MS, DEFAULTS.daemonDataMs),
    killGraceMs: positiveFinite(env.GROWTH_KILL_GRACE_MS, DEFAULTS.killGraceMs),
    lockHeartbeatMs: positiveFinite(env.GROWTH_LOCK_HEARTBEAT_MS, DEFAULTS.lockHeartbeatMs),
    lockLeaseMs: positiveFinite(env.GROWTH_LOCK_LEASE_MS, DEFAULTS.lockLeaseMs),
    daemonHeartbeatMs: positiveFinite(env.GROWTH_DAEMON_HEARTBEAT_MS, DEFAULTS.daemonHeartbeatMs),
  };
  if (policy.lockHeartbeatMs >= policy.lockLeaseMs) {
    policy.lockHeartbeatMs = DEFAULTS.lockHeartbeatMs;
    policy.lockLeaseMs = DEFAULTS.lockLeaseMs;
  }
  return {
    ...policy,
    runModeTimeouts: Object.freeze({
      weekly: policy.weeklyMs,
      drafts: policy.draftsMs,
      "drafts-auto": policy.draftsMs,
      initiatives: policy.initiativesMs,
      "initiatives-auto": policy.initiativesMs,
      revise: policy.pullLoopMs,
      regen: policy.pullLoopMs,
      "regen-body": policy.pullLoopMs,
      advise: policy.pullLoopMs,
      decorate: policy.pullLoopMs,
      apply: policy.pullLoopMs,
      "comment-revise": policy.pullLoopMs,
      "image-prompt": policy.imagePromptMs,
    }),
    draftPhaseTimeouts: Object.freeze({
      research: policy.draftResearchMs,
      write: policy.draftWriteMs,
      publish: policy.publishDraftMs,
    }),
  };
}

export function buildProcessFailureDetail(result, context) {
  return [
    `phase=${result.phase}`,
    `jobId=${context.jobId}`,
    `timeoutMs=${context.timeoutMs}`,
    `SIGTERM=${result.termSent}`,
    `SIGKILL=${result.forceKilled}`,
    `exit=${result.exitCode}`,
    `resume=${context.resumeCommand}`,
  ].join(" ");
}

function assertPositiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
}

function groupIdFor(child) {
  const inherited = Number(process.env[PROCESS_GROUP_ENV]);
  /* istanbul ignore next -- inherited branch executes in the integration-test subprocess */
  return Number.isSafeInteger(inherited) && inherited > 0 ? inherited : child.pid;
}

function killTree(child, signal) {
  /* istanbul ignore if -- spawned processes have a PID before termination paths run */
  if (!child.pid) return false;
  try {
    /* istanbul ignore if -- Windows process tree is exercised on Windows CI/operation */
    if (process.platform === "win32") {
      const args = ["/pid", String(child.pid), "/T"];
      if (signal === "SIGKILL") args.push("/F");
      const killer = spawn("taskkill", args, { stdio: "ignore", windowsHide: true });
      killer.unref();
    } else {
      process.kill(-groupIdFor(child), signal);
    }
    return true;
  /* istanbul ignore next -- process-group fallback is platform/runtime defensive */
  } catch {
    /* istanbul ignore next -- child.kill throwing is a last-resort runtime failure */
    try { return child.kill(signal); } catch { return false; }
  }
}

export function startPeriodicTask(task, intervalMs, options = {}) {
  assertPositiveFinite("intervalMs", intervalMs);
  let isRunning = false;
  let isStopped = false;
  const invoke = async () => {
    if (isStopped || isRunning) return;
    isRunning = true;
    try { await task(); } catch (error) {
      process.stderr.write(`[heartbeat] ${error instanceof Error ? error.message : String(error)}\n`);
    } finally { isRunning = false; }
  };
  const timer = setInterval(invoke, intervalMs);
  timer.unref?.();
  if (options.runImmediately) void invoke();
  return () => { isStopped = true; clearInterval(timer); };
}

function spawnSpec(command, args, options) {
  const hasInheritedGroup = process.platform !== "win32" && Boolean(process.env[PROCESS_GROUP_ENV]);
  /* istanbul ignore if -- Windows/inherited branches execute outside the instrumented test process */
  if (process.platform === "win32" || hasInheritedGroup) {
    return {
      command,
      args: [...args],
      detached: false,
      env: options.env,
      shell: options.shell ?? false,
      isWrapper: false,
    };
  }
  return {
    command: process.execPath,
    args: ["-e", ROOT_LAUNCHER, command, ...args],
    detached: true,
    env: { ...options.env, GROWTH_PROCESS_GROUP_SHELL: options.shell ? "1" : "0" },
    shell: false,
    isWrapper: true,
  };
}

export function runProcess(command, args, options) {
  assertPositiveFinite("timeoutMs", options.timeoutMs);
  const killGraceMs = options.killGraceMs ?? DEFAULTS.killGraceMs;
  assertPositiveFinite("killGraceMs", killGraceMs);
  const maxBuffer = options.maxBuffer ?? 1024 * 1024;
  assertPositiveFinite("maxBuffer", maxBuffer);
  if (options.heartbeatMs !== undefined) assertPositiveFinite("heartbeatMs", options.heartbeatMs);
  const phase = options.phase ?? command;
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const capture = options.stdio === "capture";
    const spec = spawnSpec(command, args, options);
    const child = spawn(spec.command, spec.args, {
      cwd: options.cwd,
      env: spec.env,
      shell: spec.shell,
      detached: spec.detached,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let leaseLost = false;
    let termSent = false;
    let forceKilled = false;
    let bufferExceeded = false;
    let terminationError;
    let graceTimer;
    let isGraceElapsed = false;
    let closeResult = null;

    const finish = (kind, code, signal, error) => {
      /* istanbul ignore if -- spawn error/close races are guarded */
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
      stopHeartbeat();
      for (const parentSignal of parentSignals) process.off(parentSignal, forwardSignal);
      resolve({ kind, exitCode: timedOut ? 124 : leaseLost ? 125 : code, phase, elapsedMs: Date.now() - startedAt, signal, stdout, stderr, timedOut, termSent, forceKilled, ...(error ? { error } : {}) });
    };
    const finishFromClose = () => {
      if (!closeResult) return;
      const { code, signal } = closeResult;
      if (leaseLost) finish("lease-lost", 125, signal, terminationError);
      else if (timedOut) finish("timeout", 124, signal, undefined);
      else if (bufferExceeded) finish("max-buffer", 1, signal, undefined);
      else if (signal) finish("signal", 1, signal, undefined);
      else if (spec.isWrapper && code === 126 && stderr.includes("GROWTH_SPAWN_ERROR:")) finish("spawn-error", 1, null, new Error(stderr.trim()));
      else finish(code === 0 ? "success" : "nonzero-exit", code, null, undefined);
    };
    const beginTermination = (kind, error) => {
      if (kind === "timeout") timedOut = true;
      if (kind === "lease-lost") {
        leaseLost = true;
        terminationError = error;
      }
      /* istanbul ignore next -- false only after the target group has already exited */
      termSent = killTree(child, "SIGTERM") || termSent;
      if (graceTimer) return;
      graceTimer = setTimeout(() => {
        /* istanbul ignore next -- false only after the target group has already exited */
        forceKilled = killTree(child, "SIGKILL") || forceKilled;
        isGraceElapsed = true;
        setTimeout(finishFromClose, 0);
      }, killGraceMs);
    };
    const controlledHeartbeat = options.heartbeat
      ? async () => {
          try {
            if (await options.heartbeat() === false) beginTermination("lease-lost", new Error("lease heartbeat returned false"));
          } catch (error) {
            beginTermination("lease-lost", error instanceof Error ? error : new Error(String(error)));
          }
        }
      : null;
    const stopHeartbeat = controlledHeartbeat && options.heartbeatMs
      ? startPeriodicTask(controlledHeartbeat, options.heartbeatMs)
      : () => {};
    const parentSignals = ["SIGINT", "SIGTERM"];
    const forwardSignal = (signal) => { killTree(child, signal); };
    for (const parentSignal of parentSignals) process.on(parentSignal, forwardSignal);

    const append = (stream, chunk) => {
      const next = stream + chunk.toString();
      if (Buffer.byteLength(next) <= maxBuffer) return next;
      bufferExceeded = true;
      beginTermination("max-buffer");
      return next.slice(0, maxBuffer);
    };
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
    /* istanbul ignore next -- POSIX root wrapper reports spawn errors via exit 126 */
    child.on("error", (error) => finish("spawn-error", 1, null, error));
    child.on("close", (code, signal) => {
      closeResult = { code, signal };
      // capture の close は共有 pipe を持つ全子孫の終了後にだけ発火する。
      // inherit は leader close だけでは子孫終了を証明できないため grace 完了まで待つ。
      /* istanbul ignore next -- short-circuit variants are platform/stdio timing dependent */
      if (!capture && (timedOut || leaseLost || bufferExceeded) && graceTimer && !isGraceElapsed) return;
      finishFromClose();
    });
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    const timeoutTimer = setTimeout(() => beginTermination("timeout"), options.timeoutMs);
  });
}
