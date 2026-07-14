// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { acquireLock, releaseLock } from "./lockfile.mjs";

const LOCK = "/tmp/test.lock";
const HELD = { acquired: false, recovery: null, previousPid: 456 };
function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}
function throwErr(code: string) {
  return vi.fn(() => { throw errno(code); });
}
function deps(overrides: Record<string, unknown> = {}) {
  return {
    pid: 123, nowMs: 10_000, staleMs: 30_000, mkdirSync: vi.fn(),
    openSync: vi.fn().mockImplementationOnce(() => { throw errno("EEXIST"); }).mockReturnValue(7),
    writeSync: vi.fn(), closeSync: vi.fn(),
    statSync: vi.fn(() => ({ mtimeMs: 9_000 })),
    readFileSync: vi.fn(() => "456"), kill: throwErr("ESRCH"), rmSync: vi.fn(),
    ...overrides,
  };
}

describe("死亡PIDと回収ガード", () => {
  it.each([
    ["死亡PID", {}, { acquired: true, recovery: "dead-pid", previousPid: 456 }],
    ["EPERM", { kill: throwErr("EPERM") }, HELD],
    ["判定不能", { kill: throwErr("EINVAL") }, HELD],
    ["不正PID", { readFileSync: vi.fn(() => "invalid") }, { ...HELD, previousPid: null }],
    ["巨大PID", { readFileSync: vi.fn(() => "999999999999999999999") }, { ...HELD, previousPid: null }],
    ["読取不能", { readFileSync: throwErr("EACCES") }, { ...HELD, previousPid: null }],
    ["不正PIDのstale", { nowMs: 100_000, statSync: vi.fn(() => ({ mtimeMs: 1_000 })), readFileSync: vi.fn(() => "invalid") }, { acquired: true, recovery: "stale", previousPid: null }],
  ])("%s", (_name, overrides, expected) => {
    expect(acquireLock(LOCK, deps(overrides))).toEqual(expected);
  });

  it.each([
    ["所有者読取前", { readFileSync: throwErr("ENOENT") }, true],
    ["再取得競合", { statSync: throwErr("ENOENT"), openSync: throwErr("EEXIST") }, false],
  ])("%sの消失", (_name, overrides, acquired) => {
    expect(acquireLock(LOCK, deps(overrides)).acquired).toBe(acquired);
  });

  it("同時回収では1プロセスだけが取得する", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "growth-lock-race-"));
    const lockPath = path.join(dir, "worker.lock");
    writeFileSync(lockPath, "2147483647");
    let contender: ReturnType<typeof acquireLock> | null = null;
    try {
      const first = acquireLock(lockPath, { rmSync(target: string, options: { force?: boolean }) {
        if (target === lockPath && contender === null) contender = acquireLock(lockPath);
        rmSync(target, options);
      } });
      expect(first.acquired).toBe(true);
      expect(contender).toEqual({ acquired: false, recovery: null, previousPid: 2_147_483_647 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("staleガードを掃除し、その回は取得しない", () => {
    const d = deps({
      nowMs: 100_000,
      mkdirSync: vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw errno("EEXIST"); }),
      statSync: vi.fn().mockReturnValueOnce({ mtimeMs: 99_000 }).mockReturnValueOnce({ mtimeMs: 1_000 }),
    });
    expect(acquireLock(LOCK, d)).toEqual(HELD);
    expect(d.rmSync).toHaveBeenCalledWith(`${LOCK}.recovery`, { recursive: true, force: true });
  });

  it.each(["ENOENT", "EACCES"] as const)("ガードstat %s", (code) => {
    const d = deps({
      mkdirSync: vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw errno("EEXIST"); }),
      statSync: vi.fn().mockReturnValueOnce({ mtimeMs: 9_000 }).mockImplementationOnce(() => { throw errno(code); }),
    });
    if (code === "ENOENT") expect(acquireLock(LOCK, d)).toEqual(HELD);
    else expect(() => acquireLock(LOCK, d)).toThrow("EACCES");
  });

  it("ガード作成エラーを再throwする", () => {
    const d = deps({ mkdirSync: vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw errno("EACCES"); }) });
    expect(() => acquireLock(LOCK, d)).toThrow("EACCES");
  });

  it.each(["ENOENT", "EACCES"] as const)("再検証stat %s", (code) => {
    const d = deps({ statSync: vi.fn().mockReturnValueOnce({ mtimeMs: 9_000 }).mockImplementationOnce(() => { throw errno(code); }) });
    if (code === "ENOENT") expect(acquireLock(LOCK, d).acquired).toBe(true);
    else expect(() => acquireLock(LOCK, d)).toThrow("EACCES");
  });

  it("再検証で所有者の消失・変更を検知する", () => {
    expect(acquireLock(LOCK, deps({ readFileSync: vi.fn().mockReturnValueOnce("456").mockImplementationOnce(() => { throw errno("ENOENT"); }) })).acquired).toBe(true);
    expect(acquireLock(LOCK, deps({
      readFileSync: vi.fn().mockReturnValueOnce("456").mockReturnValueOnce("789"),
      kill: vi.fn().mockImplementationOnce(() => { throw errno("ESRCH"); }).mockImplementationOnce(() => undefined),
    }))).toEqual({ acquired: false, recovery: null, previousPid: 789 });
  });

  it("回収後の再作成競合は取得失敗を返す", () => {
    expect(acquireLock(LOCK, deps({ openSync: throwErr("EEXIST") }))).toEqual(HELD);
  });
});

describe("所有者を守る解放", () => {
  it.each([["456", false], ["ENOENT", false]])("owner=%s", (owner, removed) => {
    const rm = vi.fn();
    releaseLock(LOCK, { pid: 123, mkdirSync: vi.fn(), readFileSync: owner === "ENOENT" ? throwErr("ENOENT") : vi.fn(() => owner), rmSync: rm });
    expect(rm).not.toHaveBeenCalledWith(LOCK, { force: true });
    expect(removed).toBe(false);
  });

  it("解放中のstale回収をブロックする", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "growth-lock-release-race-"));
    const lockPath = path.join(dir, "worker.lock");
    writeFileSync(lockPath, String(process.pid));
    utimesSync(lockPath, new Date(0), new Date(0));
    let contender: ReturnType<typeof acquireLock> | null = null;
    try {
      releaseLock(lockPath, { rmSync(target: string, options: { force?: boolean }) {
        if (target === lockPath && contender === null) contender = acquireLock(lockPath, { pid: 999_998 });
        rmSync(target, options);
      } });
      expect(contender?.acquired).toBe(false);
      expect(() => readFileSync(lockPath, "utf8")).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("別プロセスが回収中なら解放しない", () => {
    const rm = vi.fn();
    releaseLock(LOCK, { nowMs: 10_000, mkdirSync: throwErr("EEXIST"), statSync: vi.fn(() => ({ mtimeMs: 9_000 })), readFileSync: vi.fn(), rmSync: rm });
    expect(rm).not.toHaveBeenCalled();
  });
});
