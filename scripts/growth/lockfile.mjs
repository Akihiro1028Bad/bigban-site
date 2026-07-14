import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import path from "node:path";

const RECOVERY_GUARD_STALE_MS = 60 * 1000;

function isErrno(error, code) {
  return typeof error === "object" && error !== null && error.code === code;
}

function createLockExclusive(lockPath, deps) {
  try {
    const fd = deps.openSync(lockPath, "wx");
    deps.writeSync(fd, String(deps.pid));
    deps.closeSync(fd);
    return true;
  } catch (error) {
    if (isErrno(error, "EEXIST")) return false;
    throw error;
  }
}

function result(acquired, recovery = null, previousPid = null) {
  return { acquired, recovery, previousPid };
}

function parsePid(value) {
  const trimmed = String(value).trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const pid = Number(trimmed);
  return Number.isSafeInteger(pid) ? pid : null;
}

function readOwnerPid(lockPath, deps) {
  try {
    return { pid: parsePid(deps.readFileSync(lockPath, "utf8")), isMissing: false };
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { pid: null, isMissing: true };
    return { pid: null, isMissing: false };
  }
}

function processState(pid, deps) {
  if (pid === null) return "unknown";
  try {
    deps.kill(pid, 0);
    return "alive";
  } catch (error) {
    if (isErrno(error, "ESRCH")) return "dead";
    if (isErrno(error, "EPERM")) return "alive";
    return "unknown";
  }
}

function retryCreate(lockPath, deps) {
  return createLockExclusive(lockPath, deps)
    ? result(true)
    : result(false);
}

function acquireRecoveryGuard(guardPath, deps) {
  try {
    deps.mkdirSync(guardPath);
    return true;
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error;
  }
  try {
    const stat = deps.statSync(guardPath);
    if (deps.nowMs - stat.mtimeMs >= RECOVERY_GUARD_STALE_MS) {
      deps.rmSync(guardPath, { recursive: true, force: true });
    }
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
  return false;
}

export function acquireLock(lockPath, deps = {}) {
  const actualDeps = {
    pid: process.pid,
    nowMs: Date.now(),
    staleMs: 30 * 60 * 1000,
    mkdirSync,
    openSync,
    writeSync,
    closeSync,
    readFileSync,
    statSync,
    rmSync,
    kill: process.kill,
    ...deps,
  };
  actualDeps.mkdirSync(path.dirname(lockPath), { recursive: true });
  if (createLockExclusive(lockPath, actualDeps)) return result(true);
  let stat;
  try {
    stat = actualDeps.statSync(lockPath);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return retryCreate(lockPath, actualDeps);
    throw error;
  }
  const owner = readOwnerPid(lockPath, actualDeps);
  if (owner.isMissing) return retryCreate(lockPath, actualDeps);
  const state = processState(owner.pid, actualDeps);
  const isStale = actualDeps.nowMs - stat.mtimeMs >= actualDeps.staleMs;
  if (state !== "dead" && !isStale) return result(false, null, owner.pid);
  const recoveryPath = `${lockPath}.recovery`;
  if (!acquireRecoveryGuard(recoveryPath, actualDeps)) {
    return result(false, null, owner.pid);
  }
  try {
    let currentStat;
    try {
      currentStat = actualDeps.statSync(lockPath);
    } catch (error) {
      if (isErrno(error, "ENOENT")) return retryCreate(lockPath, actualDeps);
      throw error;
    }
    const currentOwner = readOwnerPid(lockPath, actualDeps);
    if (currentOwner.isMissing) return retryCreate(lockPath, actualDeps);
    const currentState = processState(currentOwner.pid, actualDeps);
    const currentIsStale = actualDeps.nowMs - currentStat.mtimeMs >= actualDeps.staleMs;
    if (currentState !== "dead" && !currentIsStale) {
      return result(false, null, currentOwner.pid);
    }
    const recovery = currentState === "dead" ? "dead-pid" : "stale";
    actualDeps.rmSync(lockPath, { force: true });
    return createLockExclusive(lockPath, actualDeps)
      ? result(true, recovery, currentOwner.pid)
      : result(false, null, currentOwner.pid);
  } finally {
    actualDeps.rmSync(recoveryPath, { recursive: true, force: true });
  }
}

export function releaseLock(lockPath, deps = {}) {
  const actualDeps = {
    pid: process.pid,
    nowMs: Date.now(),
    mkdirSync,
    readFileSync,
    rmSync,
    statSync,
    ...deps,
  };
  const recoveryPath = `${lockPath}.recovery`;
  if (!acquireRecoveryGuard(recoveryPath, actualDeps)) return;
  try {
    const owner = readOwnerPid(lockPath, actualDeps);
    if (owner.isMissing || owner.pid !== actualDeps.pid) return;
    actualDeps.rmSync(lockPath, { force: true });
  } finally {
    actualDeps.rmSync(recoveryPath, { recursive: true, force: true });
  }
}
