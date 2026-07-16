import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PROCESS_GROUP_ENV = "GROWTH_PROCESS_CURRENT_GROUP";
const PROCESS_REGISTRY_ENV = "GROWTH_PROCESS_GROUP_REGISTRY";
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

export function classifyProcessClose(state) {
  if (state.isWrapper && state.code === 126 && state.stderr.includes("GROWTH_SPAWN_ERROR:")) return "spawn-error";
  if (state.leaseLost) return "lease-lost";
  if (state.timedOut) return "timeout";
  if (state.bufferExceeded) return "max-buffer";
  if (state.signal) return "signal";
  return state.code === 0 ? "success" : "nonzero-exit";
}

export function createTaskkillRunner(spawnTaskkill) {
  return (args) => new Promise((resolve) => {
      let settled = false;
      const finish = (didStart) => {
        /* istanbul ignore if -- error/close may race on spawn failure */
        if (settled) return;
        settled = true;
        resolve(didStart);
      };
      const killer = spawnTaskkill("taskkill", args, { stdio: "ignore", windowsHide: true });
      killer.once("error", () => finish(false));
      killer.once("close", () => finish(true));
    });
}

export function waitForDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WINDOWS_TERMINATION_DEPENDENCIES = Object.freeze({
  runTaskkill: createTaskkillRunner(spawn),
  wait: waitForDelay,
});

export async function terminateWindowsProcessTree(pid, killGraceMs, leaderClose, dependencies) {
  const graceful = dependencies.runTaskkill(["/pid", String(pid), "/T"]);
  await dependencies.wait(killGraceMs);
  const forced = dependencies.runTaskkill(["/pid", String(pid), "/T", "/F"]);
  const [termSent, forceKilled] = await Promise.all([graceful, forced, leaderClose]);
  return { termSent, forceKilled };
}

function assertPositiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
}

function registryRecord(registryPath, record) {
  appendFileSync(registryPath, `${JSON.stringify(record)}\n`, "utf8");
}

function activeGroups(registryPath) {
  let records = "";
  try {
    records = readFileSync(registryPath, "utf8");
  } catch {
    /* istanbul ignore next -- registry is created before the first child is spawned */
    return new Map();
  }
  return parseProcessGroupRegistry(records);
}

export function parseProcessGroupRegistry(records) {
  const groups = new Map();
  for (const line of records.split("\n")) {
    if (!line) continue;
    try {
      const record = JSON.parse(line);
      if (record.operation === "add") groups.set(record.groupId, record.parentGroupId);
      else if (record.operation === "remove") groups.delete(record.groupId);
    } catch {
      continue;
    }
  }
  return groups;
}

function subtreeGroupIds(registryPath, rootGroupId) {
  const groups = activeGroups(registryPath);
  const selected = new Set([rootGroupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [groupId, parentGroupId] of groups) {
      if (selected.has(parentGroupId) && !selected.has(groupId)) {
        selected.add(groupId);
        changed = true;
      }
    }
  }
  return [...selected].reverse();
}

function signalProcessGroups(child, groupIds, signal) {
  /* istanbul ignore if -- spawned processes have a PID before termination paths run */
  if (!child.pid) return false;
  let sent = false;
  for (const groupId of groupIds) {
    try {
      process.kill(-groupId, signal);
      sent = true;
    } catch (error) {
      /* istanbul ignore next -- only unexpected OS errors are rethrown; ESRCH is the expected race */
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  }
  return sent;
}

function isProcessGroupAlive(groupId) {
  try {
    process.kill(-groupId, 0);
    return true;
  } catch (error) {
    /* istanbul ignore else -- non-ESRCH errors fail closed */
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
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

function spawnSpec(command, args, options, registryPath) {
  const inheritedEnv = { ...process.env, ...options.env };
  /* istanbul ignore if -- Windows branch executes on Windows CI/operation */
  if (process.platform === "win32") {
    return {
      command,
      args: [...args],
      detached: false,
      env: inheritedEnv,
      shell: options.shell ?? false,
      isWrapper: false,
    };
  }
  return {
    command: process.execPath,
    args: ["-e", ROOT_LAUNCHER, command, ...args],
    detached: true,
    env: {
      ...inheritedEnv,
      [PROCESS_REGISTRY_ENV]: registryPath,
      GROWTH_PROCESS_GROUP_SHELL: options.shell ? "1" : "0",
    },
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
    const inheritedRegistryPath = process.env[PROCESS_REGISTRY_ENV];
    /* istanbul ignore next -- inherited registry is exercised inside integration subprocesses */
    const registryDirectory = process.platform !== "win32" && !inheritedRegistryPath
      ? mkdtempSync(path.join(tmpdir(), "growth-process-groups-"))
      : null;
    /* istanbul ignore next -- non-root alternative is exercised inside integration subprocesses */
    const registryPath = inheritedRegistryPath ?? (registryDirectory ? path.join(registryDirectory, "groups.log") : "");
    const parentGroup = Number(process.env[PROCESS_GROUP_ENV]);
    /* istanbul ignore next -- parent group is supplied only to nested integration subprocesses */
    const parentGroupId = Number.isSafeInteger(parentGroup) && parentGroup > 0 ? parentGroup : null;
    const spec = spawnSpec(command, args, options, registryPath);
    const pipeWrapperStderr = spec.isWrapper && !capture;
    /* istanbul ignore next -- Windows inherit path runs on Windows CI/operation */
    const stderrMode = capture || pipeWrapperStderr ? "pipe" : "inherit";
    const child = spawn(spec.command, spec.args, {
      cwd: options.cwd,
      env: spec.env,
      shell: spec.shell,
      detached: spec.detached,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", capture ? "pipe" : "inherit", stderrMode],
      windowsHide: true,
    });
    /* istanbul ignore next -- spawn returns a PID before this synchronous line */
    const rootGroupId = child.pid ?? 0;
    /* istanbul ignore else -- Windows/no-PID branch is platform/runtime defensive */
    if (process.platform !== "win32" && rootGroupId > 0) {
      registryRecord(registryPath, { operation: "add", groupId: rootGroupId, parentGroupId });
    }
    let stdout = "";
    let stderr = "";
    let wrapperStderr = "";
    let settled = false;
    let timedOut = false;
    let leaseLost = false;
    let termSent = false;
    let forceKilled = false;
    let bufferExceeded = false;
    let terminationError;
    let graceTimer;
    let groupPollTimer;
    let closeResult = null;
    let timeoutTimer;
    let resolveLeaderClose;
    const leaderClose = new Promise((resolveClose) => { resolveLeaderClose = resolveClose; });
    let terminationStarted = false;
    let windowsTerminationComplete = false;
    let windowsTerminationPromise = null;
    let forwardedSignal = null;
    const terminationGroupIds = new Set();

    const refreshTerminationGroups = () => {
      /* istanbul ignore if -- Windows uses taskkill /T */
      if (process.platform === "win32") return [rootGroupId];
      for (const groupId of subtreeGroupIds(registryPath, rootGroupId)) terminationGroupIds.add(groupId);
      return [...terminationGroupIds];
    };
    const haveTerminationGroupsExited = () => refreshTerminationGroups().every((groupId) => !isProcessGroupAlive(groupId));

    const finish = (kind, code, signal, error) => {
      /* istanbul ignore if -- spawn error/close races are guarded */
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
      if (groupPollTimer) clearInterval(groupPollTimer);
      stopHeartbeat();
      for (const parentSignal of parentSignals) process.off(parentSignal, forwardSignal);
      /* istanbul ignore else -- Windows/no-PID branch is platform/runtime defensive */
      if (process.platform !== "win32" && rootGroupId > 0) {
        registryRecord(registryPath, { operation: "remove", groupId: rootGroupId });
      }
      /* istanbul ignore else -- nested cleanup is exercised inside integration subprocesses */
      if (registryDirectory) rmSync(registryDirectory, { recursive: true, force: true });
      resolve({ kind, exitCode: timedOut ? 124 : leaseLost ? 125 : code, phase, elapsedMs: Date.now() - startedAt, signal, stdout, stderr, timedOut, termSent, forceKilled, ...(error ? { error } : {}) });
    };
    const finishFromClose = () => {
      /* istanbul ignore if -- callers invoke this only after closeResult is assigned */
      if (!closeResult) return;
      const { code, signal } = closeResult;
      const diagnosticStderr = capture ? stderr : wrapperStderr;
      const kind = classifyProcessClose({ leaseLost, timedOut, bufferExceeded, isWrapper: spec.isWrapper, code, signal, stderr: diagnosticStderr });
      if (kind === "spawn-error") {
        timedOut = false;
        finish(kind, 1, null, new Error(diagnosticStderr.trim()));
      } else if (kind === "lease-lost") finish(kind, 125, signal, terminationError);
      else if (kind === "timeout") finish(kind, 124, signal, undefined);
      else if (kind === "max-buffer" || kind === "signal") finish(kind, 1, signal, undefined);
      else finish(kind, code, null, undefined);
    };
    const finishTerminatedTree = () => {
      if (!closeResult) return;
      /* istanbul ignore next -- Windows runProcess wiring is exercised through the injected controller */
      if (process.platform === "win32") {
        if (windowsTerminationComplete) finishFromClose();
        return;
      }
      if (haveTerminationGroupsExited()) finishFromClose();
    };
    const beginTermination = (kind, error, initialSignal = "SIGTERM") => {
      terminationStarted = true;
      if (kind === "timeout") timedOut = true;
      if (kind === "lease-lost") {
        leaseLost = true;
        terminationError = error;
      }
      /* istanbul ignore next -- Windows runProcess wiring is exercised through the injected controller */
      if (process.platform === "win32") {
        if (!windowsTerminationPromise) {
          windowsTerminationPromise = terminateWindowsProcessTree(rootGroupId, killGraceMs, leaderClose, WINDOWS_TERMINATION_DEPENDENCIES).then((result) => {
            termSent = result.termSent || termSent;
            forceKilled = result.forceKilled || forceKilled;
            windowsTerminationComplete = true;
            finishTerminatedTree();
          });
        }
        return;
      }
      /* istanbul ignore next -- false only after the target tree has already exited */
      termSent = signalProcessGroups(child, refreshTerminationGroups(), initialSignal) || termSent;
      if (graceTimer) return;
      groupPollTimer = setInterval(finishTerminatedTree, 10);
      graceTimer = setTimeout(() => {
        /* istanbul ignore next -- false only after the target tree has already exited */
        forceKilled = signalProcessGroups(child, refreshTerminationGroups(), "SIGKILL") || forceKilled;
        finishTerminatedTree();
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
    const forwardSignal = (signal) => {
      forwardedSignal = signal;
      /* istanbul ignore next -- Windows runProcess wiring is exercised through the injected controller */
      if (process.platform === "win32") {
        beginTermination("parent-signal");
      } else beginTermination("parent-signal", undefined, signal);
    };
    for (const parentSignal of parentSignals) process.on(parentSignal, forwardSignal);

    const append = (stream, chunk) => {
      const next = stream + chunk.toString();
      if (Buffer.byteLength(next) <= maxBuffer) return next;
      bufferExceeded = true;
      beginTermination("max-buffer");
      return next.slice(0, maxBuffer);
    };
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => {
      if (capture) stderr = append(stderr, chunk);
      else {
        wrapperStderr = (wrapperStderr + chunk.toString()).slice(-maxBuffer);
        process.stderr.write(chunk);
      }
    });
    /* istanbul ignore next -- POSIX root wrapper reports spawn errors via exit 126 */
    child.on("error", (error) => finish("spawn-error", 1, null, error));
    child.on("close", (code, signal) => {
      closeResult = { code, signal: signal ?? forwardedSignal };
      resolveLeaderClose();
      if (terminationStarted) finishTerminatedTree();
      else finishFromClose();
    });
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    timeoutTimer = setTimeout(() => beginTermination("timeout"), options.timeoutMs);
  });
}
