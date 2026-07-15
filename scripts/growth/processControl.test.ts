// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveTimeoutPolicy, runProcess, startPeriodicTask } from "./processControl.mjs";

describe("timeout policy", () => {
  it("全 mode・draft phase・daemon job に正の有限値を定義する", () => {
    const policy = resolveTimeoutPolicy();
    const values = [...Object.values(policy.runModeTimeouts), ...Object.values(policy.draftPhaseTimeouts), policy.daemonDataMs, policy.controlMs];
    expect(values.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(policy.lockHeartbeatMs).toBeLessThan(policy.lockLeaseMs);
  });

  it("正値を採用し、不正値を既定値へ戻す", () => {
    expect(resolveTimeoutPolicy({ GROWTH_TIMEOUT_CONTROL_MS: "321" }).controlMs).toBe(321);
    for (const invalid of ["0", "-1", "Infinity", "x"]) {
      expect(resolveTimeoutPolicy({ GROWTH_TIMEOUT_CONTROL_MS: invalid }).controlMs).toBe(120_000);
    }
    const invalidLeasePair = resolveTimeoutPolicy({ GROWTH_LOCK_HEARTBEAT_MS: "100", GROWTH_LOCK_LEASE_MS: "100" });
    expect(invalidLeasePair.lockHeartbeatMs).toBe(60_000);
    expect(invalidLeasePair.lockLeaseMs).toBe(900_000);
    const allOverrides = resolveTimeoutPolicy(Object.fromEntries([
      "CONTROL", "PULL_LOOP", "WEEKLY", "INITIATIVES", "IMAGE_PROMPT", "DRAFTS", "DRAFT_RESEARCH", "DRAFT_WRITE", "PUBLISH_DRAFT", "DAEMON_DATA",
    ].map((name) => [`GROWTH_TIMEOUT_${name}_MS`, "1234"]).concat([
      ["GROWTH_KILL_GRACE_MS", "1234"], ["GROWTH_LOCK_HEARTBEAT_MS", "100"], ["GROWTH_LOCK_LEASE_MS", "1000"], ["GROWTH_DAEMON_HEARTBEAT_MS", "1234"],
    ])));
    expect(allOverrides.weeklyMs).toBe(1234);
  });
});

describe("runProcess", () => {
  it("正常終了と capture を返す", async () => {
    const result = await runProcess(process.execPath, ["-e", "process.stdout.write('ok'); process.stderr.write('warn')"], { timeoutMs: 2_000, phase: "test", stdio: "capture" });
    expect(result).toMatchObject({ kind: "success", exitCode: 0, phase: "test", stdout: "ok", stderr: "warn", timedOut: false, termSent: false, forceKilled: false });
  });

  it("非0 exitと明示optionsを正規化する", async () => {
    const result = await runProcess(process.execPath, ["-e", "process.exit(3)"], { timeoutMs: 2_000, cwd: process.cwd(), env: process.env, shell: false, stdio: "capture" });
    expect(result).toMatchObject({ kind: "nonzero-exit", exitCode: 3 });
  });

  it("inherit modeでも正常終了する", async () => {
    expect(await runProcess(process.execPath, ["-e", ""], { timeoutMs: 2_000, stdio: "inherit" })).toMatchObject({ kind: "success" });
  });

  it("stdin promptを子へ渡す", async () => {
    const result = await runProcess(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], { timeoutMs: 2_000, stdin: "prompt", stdio: "capture" });
    expect(result.stdout).toBe("prompt");
  });

  it("timeout で SIGTERM、猶予内に終わらなければ SIGKILL と exit 124 を返す", async () => {
    const result = await runProcess(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], { timeoutMs: 500, killGraceMs: 30, phase: "hung", stdio: "capture" });
    expect(result).toMatchObject({ kind: "timeout", exitCode: 124, phase: "hung", timedOut: true, termSent: true, forceKilled: true });
  });

  it("spawn error・signal・maxBufferを timeout と区別する", async () => {
    expect(await runProcess("__missing_growth_command__", [], { timeoutMs: 100, stdio: "capture" })).toMatchObject({ kind: "spawn-error", timedOut: false });
    expect(await runProcess(process.execPath, ["-e", "process.kill(process.pid, 'SIGTERM')"], { timeoutMs: 2_000, stdio: "capture" })).toMatchObject({ kind: "signal", timedOut: false, signal: "SIGTERM" });
    expect(await runProcess(process.execPath, ["-e", "process.stdout.write('12345')"], { timeoutMs: 2_000, stdio: "capture", maxBuffer: 4 })).toMatchObject({ kind: "max-buffer", timedOut: false });
  });

  it("maxBuffer超過でSIGTERMを無視する子は猶予後に強制終了する", async () => {
    const script = "process.on('SIGTERM',()=>{}); setTimeout(()=>process.stdout.write('12345'),100); setInterval(()=>{},1000)";
    expect(await runProcess(process.execPath, ["-e", script], { timeoutMs: 2_000, killGraceMs: 30, stdio: "capture", maxBuffer: 4 })).toMatchObject({ kind: "max-buffer", forceKilled: true });
  });

  it("SIGTERM猶予内終了ならSIGKILLしない", async () => {
    const result = await runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 100, killGraceMs: 1_000, stdio: "capture" });
    expect(result).toMatchObject({ kind: "timeout", exitCode: 124, termSent: true, forceKilled: false });
  });

  it("親 SIGINT/SIGTERM を子へ伝播する", async () => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      const running = runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 2_000, stdio: "capture" });
      await new Promise((resolve) => setTimeout(resolve, 100));
      process.emit(signal, signal);
      expect(await running).toMatchObject({ kind: "signal", signal });
    }
  });

  it("heartbeatを継続し、falseならlease喪失として子を止める", async () => {
    const heartbeat = vi.fn(() => false);
    const result = await runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 2_000, heartbeat, heartbeatMs: 100, stdio: "capture" });
    expect(heartbeat).toHaveBeenCalled();
    expect(result.kind).toBe("signal");
  });

  it("true heartbeat中は正常終了を妨げない", async () => {
    const heartbeat = vi.fn(() => true);
    const result = await runProcess(process.execPath, ["-e", "setTimeout(()=>{},250)"], { timeoutMs: 2_000, heartbeat, heartbeatMs: 100, stdio: "capture" });
    expect(result.kind).toBe("success");
    expect(heartbeat).toHaveBeenCalled();
  });

  it("必須の正の有限値を検証する", () => {
    expect(() => runProcess("x", [], { timeoutMs: 0 })).toThrow("timeoutMs");
    expect(() => runProcess("x", [], { timeoutMs: 1, killGraceMs: 0 })).toThrow("killGraceMs");
    expect(() => runProcess("x", [], { timeoutMs: 1, maxBuffer: 0 })).toThrow("maxBuffer");
    expect(() => runProcess("x", [], { timeoutMs: 1, heartbeatMs: 0 })).toThrow("heartbeatMs");
    expect(() => startPeriodicTask(() => undefined, 0)).toThrow("intervalMs");
  });
});

describe("periodic heartbeat", () => {
  it("長時間中も継続し、前回実行中は重複しない", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const task = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const stop = startPeriodicTask(task, 100, { runImmediately: true });
    await vi.advanceTimersByTimeAsync(350);
    expect(task).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(2);
    stop();
    vi.useRealTimers();
  });

  it("heartbeat errorを握りつぶして次回を継続する", async () => {
    vi.useFakeTimers();
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const task = vi.fn().mockRejectedValueOnce(new Error("heartbeat failed")).mockResolvedValue(undefined);
    const stop = startPeriodicTask(task, 100, { runImmediately: true });
    await vi.advanceTimersByTimeAsync(200);
    expect(task).toHaveBeenCalledTimes(3);
    expect(stderr).toHaveBeenCalled();
    stop();
    stderr.mockRestore();
    vi.useRealTimers();
  });

  it("Error以外のheartbeat失敗も文字列化する", async () => {
    vi.useFakeTimers();
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stop = startPeriodicTask(() => Promise.reject("failed"), 100, { runImmediately: true });
    await vi.advanceTimersByTimeAsync(1);
    expect(stderr).toHaveBeenCalled();
    stop();
    stderr.mockRestore();
    vi.useRealTimers();
  });
});

it("主要ランナーは child_process を直接使用しない", () => {
  for (const file of ["run.mjs", "draft-orchestrator-cli.ts", "daemon-cli.ts"]) {
    expect(readFileSync(path.join(process.cwd(), "scripts/growth", file), "utf8")).not.toContain('node:child_process');
  }
});
