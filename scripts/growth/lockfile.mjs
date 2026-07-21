import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const RECOVERY_GUARD_STALE_MS = 60 * 1000;
const DEFAULT_LEASE_MS = 15 * 60 * 1000;
const DEFAULT_LEGACY_STALE_MS = 30 * 60 * 1000;

function isErrno(error, code) {
  return typeof error === "object" && error !== null && error.code === code;
}

function parsePid(value) {
  const trimmed = String(value).trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const pid = Number(trimmed);
  return Number.isSafeInteger(pid) ? pid : null;
}

function isLease(value) {
  return typeof value === "object" && value !== null
    && value.version === 1
    && Number.isSafeInteger(value.pid) && value.pid > 0
    && typeof value.host === "string" && value.host.length > 0
    && typeof value.jobId === "string" && value.jobId.length > 0
    && typeof value.mode === "string" && value.mode.length > 0
    && typeof value.acquiredAt === "string" && Number.isFinite(Date.parse(value.acquiredAt))
    && typeof value.lastHeartbeatAt === "string" && Number.isFinite(Date.parse(value.lastHeartbeatAt));
}

function parseLockText(text) {
  const legacyPid = parsePid(text);
  if (legacyPid !== null) return { lease: null, legacyPid, isMalformed: false };
  try {
    const parsed = JSON.parse(String(text));
    return isLease(parsed)
      ? { lease: parsed, legacyPid: null, isMalformed: false }
      : { lease: null, legacyPid: null, isMalformed: true };
  } catch {
    return { lease: null, legacyPid: null, isMalformed: true };
  }
}

function readLockWithDeps(lockPath, deps) {
  try {
    return { ...parseLockText(deps.readFileSync(lockPath, "utf8")), isMissing: false, isUnreadable: false };
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return { lease: null, legacyPid: null, isMalformed: false, isMissing: true, isUnreadable: false };
    }
    return { lease: null, legacyPid: null, isMalformed: false, isMissing: false, isUnreadable: true };
  }
}

export function readLock(lockPath, deps = {}) {
  return readLockWithDeps(lockPath, { readFileSync, ...deps });
}

function ownerToken(lease) {
  return { pid: lease.pid, host: lease.host, jobId: lease.jobId };
}

function sameOwner(lease, token) {
  return lease.pid === token.pid && lease.host === token.host && lease.jobId === token.jobId;
}

function serializeLease(deps) {
  const nowIso = new Date(deps.nowMs).toISOString();
  return {
    version: 1,
    pid: deps.pid,
    host: deps.host,
    jobId: deps.jobId,
    mode: deps.mode,
    acquiredAt: nowIso,
    lastHeartbeatAt: nowIso,
  };
}

function createLockExclusive(lockPath, deps) {
  const lease = serializeLease(deps);
  try {
    const fd = deps.openSync(lockPath, "wx");
    try { deps.writeSync(fd, JSON.stringify(lease)); } finally { deps.closeSync(fd); }
    return lease;
  } catch (error) {
    if (isErrno(error, "EEXIST")) return null;
    throw error;
  }
}

function result(acquired, recovery = null, previousPid = null, lease = null) {
  return { acquired, recovery, previousPid, token: lease ? ownerToken(lease) : null, lease };
}

function processState(pid, deps) {
  /* istanbul ignore if -- callers only pass validated lease/legacy PIDs */
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

function fingerprint(owner) {
  if (owner.lease) return `lease:${JSON.stringify(owner.lease)}`;
  if (owner.legacyPid !== null) return `pid:${owner.legacyPid}`;
  if (owner.isMalformed) return "malformed";
  /* istanbul ignore else -- reaching this tail means the owner is unreadable */
  if (owner.isUnreadable) return "unreadable";
  /* istanbul ignore next -- missing owner is handled before fingerprint comparison */
  return "missing";
}

function recoveryDecision(owner, stat, deps) {
  if (owner.isUnreadable) return null;
  if (owner.lease) {
    const isExpired = deps.nowMs - Date.parse(owner.lease.lastHeartbeatAt) >= deps.leaseMs;
    if (owner.lease.host === deps.host) {
      const state = processState(owner.lease.pid, deps);
      if (state === "dead") return "dead-pid";
      if (state === "alive") {
        if (!isExpired) return null;
        return owner.lease.pid === deps.pid && owner.lease.jobId !== deps.jobId
          ? "pid-reused"
          : "expired-lease";
      }
      return isExpired ? "expired-lease" : null;
    }
    return isExpired ? "expired-lease" : null;
  }
  if (owner.legacyPid !== null) {
    const state = processState(owner.legacyPid, deps);
    if (state === "dead") return "dead-pid";
    if (state === "alive") return null;
    return deps.nowMs - stat.mtimeMs >= deps.staleMs ? "legacy-stale" : null;
  }
  return owner.isMalformed && deps.nowMs - stat.mtimeMs >= deps.staleMs ? "legacy-stale" : null;
}

function lockStat(lockPath, deps) {
  try { return { value: deps.statSync(lockPath), isMissing: false }; }
  catch (error) {
    if (isErrno(error, "ENOENT")) return { value: null, isMissing: true };
    throw error;
  }
}

function retryCreate(lockPath, deps) {
  const lease = createLockExclusive(lockPath, deps);
  return lease ? result(true, null, null, lease) : result(false);
}

export function acquireLock(lockPath, deps = {}) {
  const actualDeps = {
    pid: process.pid,
    host: hostname(),
    jobId: randomUUID(),
    mode: "unknown",
    nowMs: Date.now(),
    leaseMs: DEFAULT_LEASE_MS,
    staleMs: DEFAULT_LEGACY_STALE_MS,
    mkdirSync, openSync, writeSync, closeSync, readFileSync, statSync, rmSync,
    kill: process.kill,
    ...deps,
  };
  actualDeps.mkdirSync(path.dirname(lockPath), { recursive: true });
  const created = createLockExclusive(lockPath, actualDeps);
  if (created) return result(true, null, null, created);

  const firstStat = lockStat(lockPath, actualDeps);
  if (firstStat.isMissing) return retryCreate(lockPath, actualDeps);
  const firstOwner = readLockWithDeps(lockPath, actualDeps);
  if (firstOwner.isMissing) return retryCreate(lockPath, actualDeps);
  const decision = recoveryDecision(firstOwner, firstStat.value, actualDeps);
  const previousPid = firstOwner.lease?.pid ?? firstOwner.legacyPid;
  if (!decision) return result(false, null, previousPid);

  const recoveryPath = `${lockPath}.recovery`;
  if (!acquireRecoveryGuard(recoveryPath, actualDeps)) return result(false, null, previousPid);
  try {
    const currentStat = lockStat(lockPath, actualDeps);
    if (currentStat.isMissing) return retryCreate(lockPath, actualDeps);
    const currentOwner = readLockWithDeps(lockPath, actualDeps);
    if (currentOwner.isMissing) return retryCreate(lockPath, actualDeps);
    if (fingerprint(currentOwner) !== fingerprint(firstOwner)) {
      return result(false, null, currentOwner.lease?.pid ?? currentOwner.legacyPid);
    }
    const currentDecision = recoveryDecision(currentOwner, currentStat.value, actualDeps);
    if (!currentDecision) return result(false, null, currentOwner.lease?.pid ?? currentOwner.legacyPid);
    actualDeps.rmSync(lockPath, { force: true });
    const next = createLockExclusive(lockPath, actualDeps);
    return next
      ? result(true, currentDecision, currentOwner.lease?.pid ?? currentOwner.legacyPid, next)
      : result(false, null, currentOwner.lease?.pid ?? currentOwner.legacyPid);
  } finally {
    actualDeps.rmSync(recoveryPath, { recursive: true, force: true });
  }
}

function guardedOwnerUpdate(lockPath, token, deps, update) {
  const recoveryPath = `${lockPath}.recovery`;
  if (!acquireRecoveryGuard(recoveryPath, deps)) return false;
  try {
    const owner = readLockWithDeps(lockPath, deps);
    if (!owner.lease || !sameOwner(owner.lease, token)) return false;
    update(owner.lease);
    return true;
  } finally {
    deps.rmSync(recoveryPath, { recursive: true, force: true });
  }
}

export function heartbeatLock(lockPath, options = {}) {
  const token = { pid: options.pid ?? process.pid, host: options.host ?? hostname(), jobId: options.jobId ?? "" };
  const deps = { nowMs: options.nowMs ?? Date.now(), mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, statSync, ...options };
  return guardedOwnerUpdate(lockPath, token, deps, (lease) => {
    const next = { ...lease, lastHeartbeatAt: new Date(deps.nowMs).toISOString() };
    const tempPath = `${lockPath}.${token.pid}.${token.jobId}.tmp`;
    deps.writeFileSync(tempPath, JSON.stringify(next), "utf8");
    deps.renameSync(tempPath, lockPath);
  });
}

export function releaseLock(lockPath, options = {}) {
  const token = { pid: options.pid ?? process.pid, host: options.host ?? hostname(), jobId: options.jobId ?? "" };
  const deps = { nowMs: options.nowMs ?? Date.now(), mkdirSync, readFileSync, rmSync, statSync, ...options };
  return guardedOwnerUpdate(lockPath, token, deps, () => deps.rmSync(lockPath, { force: true }));
}
