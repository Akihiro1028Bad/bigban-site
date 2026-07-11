import {
  closeSync,
  mkdirSync,
  openSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import path from "node:path";

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

export function acquireLock(lockPath, deps = {}) {
  const actualDeps = {
    pid: process.pid,
    nowMs: Date.now(),
    staleMs: 30 * 60 * 1000,
    mkdirSync,
    openSync,
    writeSync,
    closeSync,
    statSync,
    rmSync,
    ...deps,
  };
  actualDeps.mkdirSync(path.dirname(lockPath), { recursive: true });
  if (createLockExclusive(lockPath, actualDeps)) return true;
  let stat;
  try {
    stat = actualDeps.statSync(lockPath);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return createLockExclusive(lockPath, actualDeps);
    throw error;
  }
  if (actualDeps.nowMs - stat.mtimeMs < actualDeps.staleMs) return false;
  actualDeps.rmSync(lockPath, { force: true });
  return createLockExclusive(lockPath, actualDeps);
}

export function releaseLock(lockPath, deps = {}) {
  const actualDeps = { rmSync, ...deps };
  actualDeps.rmSync(lockPath, { force: true });
}
