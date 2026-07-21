// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { acquireLock, heartbeatLock, readLock, releaseLock } from "./lockfile.mjs";

describe("lease lock", () => {
  it("pid・host・jobId・mode・時刻を持つ JSON lease を取得する", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "growth-lock-"));
    const lockPath = path.join(dir, "worker.lock");
    try {
      const acquired = acquireLock(lockPath, {
        pid: 456,
        host: "worker-a",
        jobId: "job-1",
        mode: "drafts-auto",
        nowMs: Date.parse("2026-07-15T00:00:00.000Z"),
      });
      expect(acquired.acquired).toBe(true);
      expect(acquired.token).toEqual({ pid: 456, host: "worker-a", jobId: "job-1" });
      expect(JSON.parse(readFileSync(lockPath, "utf8"))).toEqual({
        version: 1,
        pid: 456,
        host: "worker-a",
        jobId: "job-1",
        mode: "drafts-auto",
        acquiredAt: "2026-07-15T00:00:00.000Z",
        lastHeartbeatAt: "2026-07-15T00:00:00.000Z",
      });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("正しい token だけが heartbeat を更新できる", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "growth-lock-"));
    const lockPath = path.join(dir, "worker.lock");
    try {
      const acquired = acquireLock(lockPath, { host: "worker-a", jobId: "job-1", nowMs: 1_000 });
      expect(heartbeatLock(lockPath, { ...acquired.token, nowMs: 2_000 })).toBe(true);
      expect(readLock(lockPath)?.lease?.lastHeartbeatAt).toBe(new Date(2_000).toISOString());
      expect(heartbeatLock(lockPath, { pid: process.pid, host: "worker-a", jobId: "old", nowMs: 3_000 })).toBe(false);
      expect(readLock(lockPath)?.lease?.lastHeartbeatAt).toBe(new Date(2_000).toISOString());
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("pid・host・jobId が一致する token だけが解放できる", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "growth-lock-"));
    const lockPath = path.join(dir, "worker.lock");
    try {
      const acquired = acquireLock(lockPath, { host: "worker-a", jobId: "job-1" });
      releaseLock(lockPath, { pid: process.pid, host: "worker-a", jobId: "old" });
      expect(readLock(lockPath)?.lease).not.toBeNull();
      releaseLock(lockPath, acquired.token ?? undefined);
      expect(readLock(lockPath)?.isMissing).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("旧 PID 形式を読み取れる", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "growth-lock-"));
    const lockPath = path.join(dir, "worker.lock");
    try {
      writeFileSync(lockPath, "123");
      expect(readLock(lockPath)).toMatchObject({ legacyPid: 123, lease: null, isMalformed: false });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("missing・unreadable・malformedを区別し、JSON schemaを検証する", () => {
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
    expect(readLock("x", { readFileSync: () => { throw missing; } })).toMatchObject({ isMissing: true });
    expect(readLock("x", { readFileSync: () => { throw Object.assign(new Error("no"), { code: "EACCES" }); } })).toMatchObject({ isUnreadable: true });
    for (const value of ["{", "{}", JSON.stringify({ version: 2 }), "0", "-1", "999999999999999999999"]) {
      expect(readLock("x", { readFileSync: () => value })).toMatchObject({ isMalformed: true });
    }
  });

  it("exclusive create の非競合エラーを再throwし、write失敗でもcloseする", () => {
    expect(() => acquireLock("/tmp/x", { mkdirSync: vi.fn(), openSync: () => { throw Object.assign(new Error("no"), { code: "EACCES" }); } })).toThrow("no");
    const closeSync = vi.fn();
    expect(() => acquireLock("/tmp/x", { mkdirSync: vi.fn(), openSync: vi.fn(() => 1), writeSync: () => { throw new Error("write"); }, closeSync })).toThrow("write");
    expect(closeSync).toHaveBeenCalledWith(1);
  });

  it("既定optionsでも取得し、tokenなしheartbeat/releaseは所有権を奪わない", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "growth-lock-default-"));
    const lockPath = path.join(dir, "worker.lock");
    try {
      expect(acquireLock(lockPath).acquired).toBe(true);
      expect(heartbeatLock(lockPath)).toBe(false);
      expect(releaseLock(lockPath)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
