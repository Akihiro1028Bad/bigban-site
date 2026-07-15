// @vitest-environment node
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { acquireLock, heartbeatLock, releaseLock } from "./lockfile.mjs";

function lease(input: Partial<Record<"pid" | "host" | "jobId" | "mode" | "lastHeartbeatAt", string | number>> = {}): string {
  return JSON.stringify({ version: 1, pid: 999_999, host: "local", jobId: "old", mode: "drafts-auto", acquiredAt: new Date(0).toISOString(), lastHeartbeatAt: new Date(0).toISOString(), ...input });
}

function withLock(content: string, run: (lockPath: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), "growth-lock-recovery-"));
  const lockPath = path.join(dir, "worker.lock");
  writeFileSync(lockPath, content);
  try { run(lockPath); } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("lease recovery", () => {
  it("同一 host の生存 PID でも lease expiry 後は回収する", () => withLock(lease({ pid: 123 }), (lockPath) => {
    utimesSync(lockPath, new Date(0), new Date(0));
    expect(acquireLock(lockPath, { host: "local", jobId: "new", nowMs: 9_999_999, leaseMs: 10, kill: vi.fn() })).toMatchObject({ acquired: true, recovery: "expired-lease" });
  }));

  it("同一 host の生存 PID は heartbeat fresh なら保持する", () => withLock(lease({ pid: 123, lastHeartbeatAt: new Date(9_500).toISOString() }), (lockPath) => {
    expect(acquireLock(lockPath, { host: "local", jobId: "new", nowMs: 10_000, leaseMs: 1_000, kill: vi.fn() }).acquired).toBe(false);
  }));

  it("同一 host の死亡 PID は fresh heartbeat でも即時回収する", () => withLock(lease({ lastHeartbeatAt: new Date().toISOString() }), (lockPath) => {
    expect(acquireLock(lockPath, { host: "local", jobId: "new", kill: () => { throw Object.assign(new Error("dead"), { code: "ESRCH" }); } })).toMatchObject({ acquired: true, recovery: "dead-pid", previousPid: 999_999 });
  }));

  it("別 host は heartbeat expiry 後に回収するが fresh なら保持する", () => {
    withLock(lease({ host: "remote", lastHeartbeatAt: new Date(9_500).toISOString() }), (lockPath) => {
      expect(acquireLock(lockPath, { host: "local", nowMs: 10_000, leaseMs: 1_000 }).acquired).toBe(false);
    });
    withLock(lease({ host: "remote" }), (lockPath) => {
      expect(acquireLock(lockPath, { host: "local", nowMs: 10_000, leaseMs: 1_000 })).toMatchObject({ acquired: true, recovery: "expired-lease" });
    });
  });

  it("同一 PID・host・jobId 不一致の期限切れ lease を PID 再利用として回収し、旧 token は解放できない", () => withLock(lease({ pid: process.pid }), (lockPath) => {
    const next = acquireLock(lockPath, { host: "local", jobId: "new", nowMs: 10_000, leaseMs: 1_000 });
    expect(next).toMatchObject({ acquired: true, recovery: "pid-reused" });
    releaseLock(lockPath, { pid: process.pid, host: "local", jobId: "old" });
    expect(acquireLock(lockPath, { host: "local", jobId: "third", nowMs: 10_500, leaseMs: 1_000 }).acquired).toBe(false);
    releaseLock(lockPath, next.token ?? undefined);
  }));

  it("guard 内の再読込で lease が変われば回収しない", () => {
    const old = lease();
    const fresh = lease({ jobId: "fresh", lastHeartbeatAt: new Date(10_000).toISOString() });
    const readFileSync = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(fresh);
    const mkdirSync = vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => undefined);
    const openSync = vi.fn(() => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); });
    expect(acquireLock("/tmp/fake.lock", { host: "local", jobId: "new", nowMs: 20_000, leaseMs: 1_000, mkdirSync, openSync, readFileSync, statSync: vi.fn(() => ({ mtimeMs: 0 })), kill: () => { throw Object.assign(new Error("dead"), { code: "ESRCH" }); }, rmSync: vi.fn() }).acquired).toBe(false);
  });

  it.each([["EPERM", true], ["ESRCH", true], ["EINVAL", true]] as const)("process state %s", (code, acquired) => withLock(lease(), (lockPath) => {
    expect(acquireLock(lockPath, { host: "local", jobId: "new", kill: () => { throw Object.assign(new Error(code), { code }); } }).acquired).toBe(acquired);
  }));

  it("unknown state は fresh lease を保持する", () => withLock(lease({ lastHeartbeatAt: new Date(9_500).toISOString() }), (lockPath) => {
    expect(acquireLock(lockPath, { host: "local", jobId: "new", nowMs: 10_000, leaseMs: 1_000, kill: () => { throw Object.assign(new Error("unknown"), { code: "EINVAL" }); } }).acquired).toBe(false);
  }));

  it("旧 PID 形式の生存 PID は mtime 超過でも回収しない", () => withLock(String(process.pid), (lockPath) => {
    utimesSync(lockPath, new Date(0), new Date(0));
    expect(acquireLock(lockPath, { staleMs: 1 }).acquired).toBe(false);
  }));

  it("読取不能 lock は fail closed で削除しない", () => {
    const rmSync = vi.fn();
    expect(acquireLock("/tmp/fake.lock", { mkdirSync: vi.fn(), openSync: () => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); }, statSync: vi.fn(() => ({ mtimeMs: 0 })), readFileSync: () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); }, rmSync }).acquired).toBe(false);
    expect(rmSync).not.toHaveBeenCalledWith("/tmp/fake.lock", { force: true });
  });

  it("同時回収では1プロセスだけ取得する", () => withLock(lease(), (lockPath) => {
    const first = acquireLock(lockPath, { host: "local", jobId: "one", kill: () => { throw Object.assign(new Error("dead"), { code: "ESRCH" }); } });
    const second = acquireLock(lockPath, { host: "local", jobId: "two" });
    expect([first.acquired, second.acquired].filter(Boolean)).toHaveLength(1);
  }));

  it("壊れた旧形式は grace 後だけ回収する", () => {
    withLock("broken", (lockPath) => expect(acquireLock(lockPath, { nowMs: Date.now(), staleMs: 60_000 }).acquired).toBe(false));
    withLock("broken", (lockPath) => {
      utimesSync(lockPath, new Date(0), new Date(0));
      expect(acquireLock(lockPath, { nowMs: 100_000, staleMs: 1_000 })).toMatchObject({ acquired: true, recovery: "legacy-stale", previousPid: null });
    });
  });

  it("旧形式の unknown PID は grace 後に回収する", () => withLock("456", (lockPath) => {
    utimesSync(lockPath, new Date(0), new Date(0));
    expect(acquireLock(lockPath, { nowMs: 100_000, staleMs: 1_000, kill: () => { throw Object.assign(new Error("unknown"), { code: "EINVAL" }); } })).toMatchObject({ acquired: true, recovery: "legacy-stale" });
  }));

  it("旧形式の死亡PIDを即時回収し、unknown freshは保持する", () => {
    withLock("456", (lockPath) => expect(acquireLock(lockPath, { kill: () => { throw Object.assign(new Error("dead"), { code: "ESRCH" }); } })).toMatchObject({ acquired: true, recovery: "dead-pid" }));
    withLock("456", (lockPath) => expect(acquireLock(lockPath, { nowMs: 1_000, staleMs: 2_000, kill: () => { throw Object.assign(new Error("unknown"), { code: "EINVAL" }); } }).acquired).toBe(false));
  });

  it("stat中に消えたlockを再作成し、再作成競合はheldにする", () => {
    const enoent = () => { throw Object.assign(new Error("gone"), { code: "ENOENT" }); };
    const base = { mkdirSync: vi.fn(), statSync: enoent, writeSync: vi.fn(), closeSync: vi.fn() };
    const existsThenFd = vi.fn().mockImplementationOnce(() => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); }).mockReturnValue(8);
    expect(acquireLock("/tmp/x", { ...base, openSync: existsThenFd }).acquired).toBe(true);
    expect(acquireLock("/tmp/x", { ...base, openSync: () => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); } }).acquired).toBe(false);
  });

  it("statの非ENOENTとguard作成エラーを再throwする", () => {
    const existing = () => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); };
    expect(() => acquireLock("/tmp/x", { mkdirSync: vi.fn(), openSync: existing, statSync: () => { throw Object.assign(new Error("stat"), { code: "EACCES" }); } })).toThrow("stat");
    expect(() => acquireLock("/tmp/x", { host: "local", nowMs: 10_000, leaseMs: 1, mkdirSync: vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw Object.assign(new Error("guard"), { code: "EACCES" }); }), openSync: existing, statSync: vi.fn(() => ({ mtimeMs: 0 })), readFileSync: vi.fn(() => lease({ host: "remote" })) })).toThrow("guard");
  });

  it("fresh/stale recovery guard と guard stat errorを処理する", () => {
    const existing = () => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); };
    const mkdir = () => vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); });
    const common = { host: "local", nowMs: 100_000, leaseMs: 1, openSync: existing, readFileSync: vi.fn(() => lease({ host: "remote" })), rmSync: vi.fn() };
    expect(acquireLock("/tmp/x", { ...common, mkdirSync: mkdir(), statSync: vi.fn().mockReturnValueOnce({ mtimeMs: 0 }).mockReturnValueOnce({ mtimeMs: 99_999 }) }).acquired).toBe(false);
    const staleRm = vi.fn();
    expect(acquireLock("/tmp/x", { ...common, rmSync: staleRm, mkdirSync: mkdir(), statSync: vi.fn().mockReturnValueOnce({ mtimeMs: 0 }).mockReturnValueOnce({ mtimeMs: 0 }) }).acquired).toBe(false);
    expect(staleRm).toHaveBeenCalledWith("/tmp/x.recovery", { recursive: true, force: true });
    expect(acquireLock("/tmp/x", { ...common, mkdirSync: mkdir(), statSync: vi.fn().mockReturnValueOnce({ mtimeMs: 0 }).mockImplementationOnce(() => { throw Object.assign(new Error("gone"), { code: "ENOENT" }); }) }).acquired).toBe(false);
    expect(() => acquireLock("/tmp/x", { ...common, mkdirSync: mkdir(), statSync: vi.fn().mockReturnValueOnce({ mtimeMs: 0 }).mockImplementationOnce(() => { throw Object.assign(new Error("denied"), { code: "EACCES" }); }) })).toThrow("denied");
  });

  it("guard再検証でunreadableになれば回収しない", () => {
    const existing = () => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); };
    const readFileSync = vi.fn().mockReturnValueOnce(lease({ host: "remote" })).mockImplementationOnce(() => { throw Object.assign(new Error("denied"), { code: "EACCES" }); });
    expect(acquireLock("/tmp/x", { host: "local", nowMs: 100_000, leaseMs: 1, mkdirSync: vi.fn(), openSync: existing, statSync: vi.fn(() => ({ mtimeMs: 0 })), readFileSync, rmSync: vi.fn() }).acquired).toBe(false);
  });

  it("各消失点・回収後競合を安全に処理する", () => {
    const e = (code: string) => Object.assign(new Error(code), { code });
    const existing = () => { throw e("EEXIST"); };
    const common = { host: "local", nowMs: 100_000, leaseMs: 1, mkdirSync: vi.fn(), openSync: existing, statSync: vi.fn(() => ({ mtimeMs: 0 })), rmSync: vi.fn() };
    expect(acquireLock("/tmp/x", { ...common, readFileSync: () => { throw e("ENOENT"); }, openSync: vi.fn().mockImplementationOnce(existing).mockReturnValue(2), writeSync: vi.fn(), closeSync: vi.fn() }).acquired).toBe(true);
    expect(acquireLock("/tmp/x", { ...common, readFileSync: vi.fn(() => lease({ host: "remote" })), statSync: vi.fn().mockReturnValueOnce({ mtimeMs: 0 }).mockImplementationOnce(() => { throw e("ENOENT"); }), openSync: vi.fn().mockImplementationOnce(existing).mockReturnValue(2), writeSync: vi.fn(), closeSync: vi.fn() }).acquired).toBe(true);
    expect(acquireLock("/tmp/x", { ...common, readFileSync: vi.fn().mockReturnValueOnce(lease({ host: "remote" })).mockImplementationOnce(() => { throw e("ENOENT"); }), openSync: vi.fn().mockImplementationOnce(existing).mockReturnValue(2), writeSync: vi.fn(), closeSync: vi.fn() }).acquired).toBe(true);
    expect(acquireLock("/tmp/x", { ...common, readFileSync: vi.fn(() => lease({ host: "remote" })) }).acquired).toBe(false);
  });

  it("guard内で同じleaseが生存へ変われば回収せず、再作成競合も安全に失敗する", () => {
    const e = (code: string) => Object.assign(new Error(code), { code });
    const openSync = vi.fn(() => { throw e("EEXIST"); });
    const kill = vi.fn().mockImplementationOnce(() => { throw e("ESRCH"); }).mockReturnValueOnce(undefined);
    const base = { host: "local", jobId: "new", mkdirSync: vi.fn(), openSync, statSync: vi.fn(() => ({ mtimeMs: 0 })), readFileSync: vi.fn(() => lease()), rmSync: vi.fn(), kill };
    expect(acquireLock("/tmp/x", base).acquired).toBe(false);
    const alwaysDead = () => { throw e("ESRCH"); };
    expect(acquireLock("/tmp/x", { ...base, kill: alwaysDead }).acquired).toBe(false);
    const legacyKill = vi.fn().mockImplementationOnce(() => { throw e("ESRCH"); }).mockReturnValueOnce(undefined);
    expect(acquireLock("/tmp/x", { ...base, readFileSync: vi.fn(() => "456"), kill: legacyKill }).acquired).toBe(false);
    expect(acquireLock("/tmp/x", { ...base, readFileSync: vi.fn(() => "456"), kill: alwaysDead }).acquired).toBe(false);
  });

  it("heartbeat/releaseは他のrecovery guard取得中なら更新しない", () => {
    const guardHeld = { mkdirSync: () => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); }, statSync: vi.fn(() => ({ mtimeMs: Date.now() })), rmSync: vi.fn() };
    expect(heartbeatLock("/tmp/x", { ...guardHeld, jobId: "x" })).toBe(false);
    expect(releaseLock("/tmp/x", { ...guardHeld, jobId: "x" })).toBe(false);
  });
});
