import { spawn } from "node:child_process";

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

function assertPositiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
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
      process.kill(-child.pid, signal);
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
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false,
      detached: process.platform !== "win32",
      stdio: [options.stdin === undefined ? "ignore" : "pipe", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let termSent = false;
    let forceKilled = false;
    let bufferExceeded = false;
    let graceTimer;
    const controlledHeartbeat = options.heartbeat
      ? async () => {
          const ownsLease = await options.heartbeat();
          if (ownsLease === false) {
            /* istanbul ignore else -- periodic task is stopped during settlement cleanup */
            /* istanbul ignore next -- false means an already-terminating child without a PID */
            if (!settled) termSent = killTree(child, "SIGTERM") || termSent;
          }
        }
      : null;
    const stopHeartbeat = controlledHeartbeat && options.heartbeatMs
      ? startPeriodicTask(controlledHeartbeat, options.heartbeatMs)
      : () => {};
    const parentSignals = ["SIGINT", "SIGTERM"];
    const forwardSignal = (signal) => { killTree(child, signal); };
    for (const signal of parentSignals) process.on(signal, forwardSignal);

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
      stopHeartbeat();
      for (const signal of parentSignals) process.off(signal, forwardSignal);
    };
    const finish = (kind, code, signal, error) => {
      /* istanbul ignore if -- event listeners are cleaned up by the first settlement */
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ kind, exitCode: timedOut ? 124 : code, phase, elapsedMs: Date.now() - startedAt, signal, stdout, stderr, timedOut, termSent, forceKilled, ...(error ? { error } : {}) });
    };
    const append = (stream, chunk) => {
      const next = stream + chunk.toString();
      if (Buffer.byteLength(next) <= maxBuffer) return next;
      bufferExceeded = true;
      /* istanbul ignore next -- duplicate chunks may arrive only after termination has begun */
      termSent = killTree(child, "SIGTERM") || termSent;
      /* istanbul ignore next -- duplicate max-buffer grace callbacks are runtime-dependent */
      graceTimer = setTimeout(() => { forceKilled = killTree(child, "SIGKILL") || forceKilled; }, killGraceMs);
      return next.slice(0, maxBuffer);
    };
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => finish("spawn-error", 1, null, error));
    child.on("exit", (code, signal) => {
      if (timedOut) finish("timeout", 124, signal, undefined);
      else if (bufferExceeded) finish("max-buffer", 1, signal, undefined);
      else if (signal) finish("signal", 1, signal, undefined);
      else finish(code === 0 ? "success" : "nonzero-exit", code, null, undefined);
    });
    if (options.stdin !== undefined) {
      child.stdin.end(options.stdin);
    }
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      termSent = killTree(child, "SIGTERM");
      graceTimer = setTimeout(() => {
        /* istanbul ignore else -- settled paths clear this grace timer in cleanup */
        if (!settled) forceKilled = killTree(child, "SIGKILL");
      }, killGraceMs);
    }, options.timeoutMs);
  });
}
