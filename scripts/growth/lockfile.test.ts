// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { acquireLock, releaseLock } from "./lockfile.mjs";

describe("acquireLock", () => {
  it("deps 未指定でも実ファイルで lock を取得できる", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "growth-lock-"));
    const lockPath = path.join(dir, "worker.lock");

    try {
      expect(acquireLock(lockPath)).toBe(true);
      expect(readFileSync(lockPath, "utf8")).toBe(String(process.pid));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("新規 lock を排他作成する", () => {
    const mkdirSync = vi.fn();
    const openSync = vi.fn().mockReturnValue(7);
    const writeSync = vi.fn();
    const closeSync = vi.fn();

    expect(
      acquireLock("/tmp/nested/test.lock", {
        pid: 456,
        mkdirSync,
        openSync,
        writeSync,
        closeSync,
      })
    ).toBe(true);

    expect(mkdirSync).toHaveBeenCalledWith("/tmp/nested", { recursive: true });
    expect(openSync).toHaveBeenCalledWith("/tmp/nested/test.lock", "wx");
    expect(writeSync).toHaveBeenCalledWith(7, "456");
    expect(closeSync).toHaveBeenCalledWith(7);
  });

  it("open の EEXIST 以外は再 throw する", () => {
    const error = new Error("permission denied") as NodeJS.ErrnoException;
    error.code = "EACCES";
    expect(() =>
      acquireLock("/tmp/test.lock", {
        mkdirSync: vi.fn(),
        openSync: vi.fn().mockImplementation(() => {
          throw error;
        }),
      })
    ).toThrow(error);
  });

  it("既存 lock が stat 前に消えたら再取得する", () => {
    const openSync = vi.fn()
      .mockImplementationOnce(() => {
        const error = new Error("exists") as NodeJS.ErrnoException;
        error.code = "EEXIST";
        throw error;
      })
      .mockReturnValueOnce(9);
    const statSync = vi.fn().mockImplementation(() => {
      const error = new Error("missing") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    });
    const writeSync = vi.fn();
    const closeSync = vi.fn();

    expect(
      acquireLock("/tmp/test.lock", {
        pid: 123,
        nowMs: 1_000,
        staleMs: 30_000,
        mkdirSync: vi.fn(),
        openSync,
        writeSync,
        closeSync,
        statSync,
        rmSync: vi.fn(),
      })
    ).toBe(true);
    expect(openSync).toHaveBeenCalledTimes(2);
    expect(writeSync).toHaveBeenCalledWith(9, "123");
    expect(closeSync).toHaveBeenCalledWith(9);
  });

  it("stale でない既存 lock は取得しない", () => {
    const openSync = vi.fn().mockImplementation(() => {
      const error = new Error("exists") as NodeJS.ErrnoException;
      error.code = "EEXIST";
      throw error;
    });

    expect(
      acquireLock("/tmp/test.lock", {
        pid: 123,
        nowMs: 10_000,
        staleMs: 30_000,
        mkdirSync: vi.fn(),
        openSync,
        writeSync: vi.fn(),
        closeSync: vi.fn(),
        statSync: vi.fn().mockReturnValue({ mtimeMs: 9_000 }),
        rmSync: vi.fn(),
      })
    ).toBe(false);
  });

  it("stat の ENOENT 以外は再 throw する", () => {
    const openSync = vi.fn().mockImplementation(() => {
      const error = new Error("exists") as NodeJS.ErrnoException;
      error.code = "EEXIST";
      throw error;
    });
    const statError = new Error("stat failed") as NodeJS.ErrnoException;
    statError.code = "EACCES";

    expect(() =>
      acquireLock("/tmp/test.lock", {
        mkdirSync: vi.fn(),
        openSync,
        statSync: vi.fn().mockImplementation(() => {
          throw statError;
        }),
      })
    ).toThrow(statError);
  });

  it("stale lock は削除して再取得する", () => {
    const openSync = vi.fn()
      .mockImplementationOnce(() => {
        const error = new Error("exists") as NodeJS.ErrnoException;
        error.code = "EEXIST";
        throw error;
      })
      .mockReturnValueOnce(11);
    const rmSync = vi.fn();

    expect(
      acquireLock("/tmp/test.lock", {
        pid: 789,
        nowMs: 100_000,
        staleMs: 30_000,
        mkdirSync: vi.fn(),
        openSync,
        writeSync: vi.fn(),
        closeSync: vi.fn(),
        statSync: vi.fn().mockReturnValue({ mtimeMs: 1_000 }),
        rmSync,
      })
    ).toBe(true);
    expect(rmSync).toHaveBeenCalledWith("/tmp/test.lock", { force: true });
    expect(openSync).toHaveBeenCalledTimes(2);
  });
});

describe("releaseLock", () => {
  it("deps 未指定でも実ファイルの lock を削除する", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "growth-lock-"));
    const lockPath = path.join(dir, "worker.lock");

    try {
      expect(acquireLock(lockPath)).toBe(true);
      releaseLock(lockPath);
      expect(acquireLock(lockPath)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lock ファイルを force 削除する", () => {
    const rmSync = vi.fn();
    releaseLock("/tmp/test.lock", { rmSync });
    expect(rmSync).toHaveBeenCalledWith("/tmp/test.lock", { force: true });
  });
});
