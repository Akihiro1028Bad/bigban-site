// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { buildProcessFailureDetail, classifyProcessClose, createTaskkillRunner, parseProcessGroupRegistry, resolveTimeoutPolicy, runProcess, startPeriodicTask, terminateWindowsProcessTree, waitForDelay } from "./processControl.mjs";

it("process group registryは追加・削除を順に適用し、壊れた行を無視する", () => {
  const groups = parseProcessGroupRegistry([
    JSON.stringify({ operation: "add", groupId: 10, parentGroupId: null }),
    JSON.stringify({ operation: "add", groupId: 20, parentGroupId: 10 }),
    JSON.stringify({ operation: "remove", groupId: 20 }),
    JSON.stringify({ operation: "unknown", groupId: 30 }),
    "broken-json",
    "",
  ].join("\n"));
  expect([...groups]).toEqual([[10, null]]);
});

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
  it("taskkill runnerはtaskkill自体のcloseを待ち、spawn errorを区別する", async () => {
    const closedChild = new EventEmitter();
    const failedChild = new EventEmitter();
    const spawnTaskkill = vi.fn()
      .mockReturnValueOnce(closedChild)
      .mockReturnValueOnce(failedChild);
    const runTaskkill = createTaskkillRunner(spawnTaskkill);
    let didResolve = false;
    const completed = runTaskkill(["/pid", "42", "/T"]).then((result) => {
      didResolve = true;
      return result;
    });

    expect(spawnTaskkill).toHaveBeenCalledWith("taskkill", ["/pid", "42", "/T"], { stdio: "ignore", windowsHide: true });
    await Promise.resolve();
    expect(didResolve).toBe(false);
    closedChild.emit("close", 0);
    await expect(completed).resolves.toBe(true);

    const failed = runTaskkill(["/pid", "42", "/T", "/F"]);
    failedChild.emit("error", new Error("taskkill missing"));
    await expect(failed).resolves.toBe(false);
  });

  it("Windowsはleader close後も猶予を維持しtaskkill /T /Fの完了までresolveしない", async () => {
    vi.useFakeTimers();
    let resolveGraceful: ((value: boolean) => void) | undefined;
    let resolveForced: ((value: boolean) => void) | undefined;
    let resolveLeaderClose: (() => void) | undefined;
    const graceful = new Promise<boolean>((resolve) => { resolveGraceful = resolve; });
    const forced = new Promise<boolean>((resolve) => { resolveForced = resolve; });
    const leaderClose = new Promise<void>((resolve) => { resolveLeaderClose = resolve; });
    const runTaskkill = vi.fn()
      .mockImplementationOnce(() => graceful)
      .mockImplementationOnce(() => forced);
    let didResolve = false;

    const termination = terminateWindowsProcessTree(42, 100, leaderClose, {
      runTaskkill,
      wait: waitForDelay,
    }).then((result) => {
      didResolve = true;
      return result;
    });

    expect(runTaskkill).toHaveBeenNthCalledWith(1, ["/pid", "42", "/T"]);
    resolveLeaderClose?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(runTaskkill).toHaveBeenNthCalledWith(2, ["/pid", "42", "/T", "/F"]);
    expect(didResolve).toBe(false);

    resolveForced?.(true);
    await Promise.resolve();
    expect(didResolve).toBe(false);
    resolveGraceful?.(true);
    await expect(termination).resolves.toEqual({ termSent: true, forceKilled: true });
    vi.useRealTimers();
  });

  it("wrapperのspawn error診断を受信済みならtimeoutフラグよりspawn-errorを優先する", () => {
    expect(classifyProcessClose({
      leaseLost: false,
      timedOut: true,
      bufferExceeded: false,
      isWrapper: true,
      code: 126,
      signal: null,
      stderr: "GROWTH_SPAWN_ERROR:spawn missing",
    })).toBe("spawn-error");
  });

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
    expect(await runProcess("exit 0", [], { timeoutMs: 2_000, shell: true, stdio: "capture" })).toMatchObject({ kind: "success" });
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
    expect(await runProcess("__missing_growth_command__", [], { timeoutMs: 2_000, stdio: "capture" })).toMatchObject({ kind: "spawn-error", timedOut: false });
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
    const result = await runProcess(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], { timeoutMs: 2_000, killGraceMs: 500, heartbeat, heartbeatMs: 200, stdio: "capture" });
    expect(heartbeat).toHaveBeenCalled();
    expect(heartbeat.mock.calls.length).toBeGreaterThan(1);
    expect(result).toMatchObject({ kind: "lease-lost", forceKilled: true, termSent: true });
  });

  it("heartbeat例外もlease喪失としてSIGTERMからSIGKILLへ昇格する", async () => {
    const result = await runProcess(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], {
      timeoutMs: 2_000,
      killGraceMs: 30,
      heartbeat: () => { throw new Error("EIO"); },
      heartbeatMs: 300,
      stdio: "capture",
    });
    expect(result).toMatchObject({ kind: "lease-lost", forceKilled: true, termSent: true });
    expect(result.error?.message).toContain("EIO");
  });

  it("Error以外のheartbeat例外もlease喪失理由として保持する", async () => {
    const result = await runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 2_000, heartbeat: () => { throw "EIO-string"; }, heartbeatMs: 100, stdio: "capture" });
    expect(result).toMatchObject({ kind: "lease-lost" });
    expect(result.error?.message).toBe("EIO-string");
  });

  it("inheritでもfence grace完了までresolveしない", async () => {
    const result = await runProcess(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], { timeoutMs: 300, killGraceMs: 30, stdio: "inherit" });
    expect(result).toMatchObject({ kind: "timeout", forceKilled: true });
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

  it("外側timeoutがnested runProcessの子まで同じPOSIX groupで停止する", async () => {
    if (process.platform === "win32") return;
    const dir = mkdtempSync(path.join(tmpdir(), "growth-process-tree-"));
    const marker = path.join(dir, "orphan.txt");
    const ready = path.join(dir, "ready.txt");
    const moduleUrl = new URL("./processControl.mjs", import.meta.url).href;
    const nestedAgent = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(ready)},'ready');process.on('SIGTERM',()=>{});setTimeout(()=>fs.writeFileSync(${JSON.stringify(marker)},'orphan'),1500);setInterval(()=>{},1000)`;
    const nested = `import { existsSync } from 'node:fs'; import { runProcess } from ${JSON.stringify(moduleUrl)}; const running=runProcess(process.execPath,['-e',${JSON.stringify(nestedAgent)}],{timeoutMs:5000,killGraceMs:30,stdio:'capture'}); while(!existsSync(${JSON.stringify(ready)})) await new Promise(resolve=>setTimeout(resolve,10)); await running;`;
    try {
      const result = await runProcess(process.execPath, ["--input-type=module", "-e", nested], { timeoutMs: 1_000, killGraceMs: 50, stdio: "capture" });
      expect(result).toMatchObject({ kind: "timeout", forceKilled: true });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(existsSync(marker)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("nested timeoutは呼び出し元を巻き込まず証跡処理へ復帰する", async () => {
    if (process.platform === "win32") return;
    const moduleUrl = new URL("./processControl.mjs", import.meta.url).href;
    const nested = `import { runProcess } from ${JSON.stringify(moduleUrl)}; const result=await runProcess(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{timeoutMs:200,killGraceMs:30,stdio:'capture'}); process.stdout.write('after:'+result.kind+':'+result.forceKilled);`;
    const outer = await runProcess(process.execPath, ["--input-type=module", "-e", nested], { timeoutMs: 2_000, killGraceMs: 50, stdio: "capture" });
    expect(outer).toMatchObject({ kind: "success", stdout: "after:timeout:true" });
  });

  it("capture close後もstdio ignoreの孫groupが生存中ならSIGKILL完了まで待つ", async () => {
    if (process.platform === "win32") return;
    const dir = mkdtempSync(path.join(tmpdir(), "growth-ignore-grandchild-"));
    const marker = path.join(dir, "survived.txt");
    const grandchild = `const fs=require('node:fs');process.on('SIGTERM',()=>{});setTimeout(()=>fs.writeFileSync(${JSON.stringify(marker)},'alive'),500);setInterval(()=>{},1000)`;
    const parent = `const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)`;
    try {
      const result = await runProcess(process.execPath, ["-e", parent], { timeoutMs: 200, killGraceMs: 50, stdio: "capture" });
      expect(result).toMatchObject({ kind: "timeout", forceKilled: true });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(existsSync(marker)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("options.env未指定時もHOME・PATH等の親環境をwrapperへ継承する", async () => {
    const result = await runProcess(process.execPath, ["-e", "process.stdout.write(JSON.stringify({HOME:process.env.HOME,PATH:process.env.PATH}))"], { timeoutMs: 2_000, stdio: "capture" });
    expect(JSON.parse(result.stdout)).toEqual({ HOME: process.env.HOME, PATH: process.env.PATH });
  });

  it("captureはexitではなくstdio closeまで待ち末尾を保持する", async () => {
    const script = "const {spawn}=require('node:child_process');spawn(process.execPath,['-e',\"setTimeout(()=>process.stdout.write('late'),100)\"],{stdio:['ignore','inherit','inherit']});";
    const result = await runProcess(process.execPath, ["-e", script], { timeoutMs: 2_000, stdio: "capture" });
    expect(result).toMatchObject({ kind: "success", stdout: "late" });
  });
});

describe("buildProcessFailureDetail", () => {
  it("timeoutの完全な証跡を共通形式へ正規化する", () => {
    const detail = buildProcessFailureDetail({ kind: "timeout", exitCode: 124, phase: "daemon:metrics", elapsedMs: 10, signal: "SIGKILL", stdout: "", stderr: "", timedOut: true, termSent: true, forceKilled: true }, { jobId: "job-1", timeoutMs: 1_800_000, resumeCommand: "npm run growth:metrics" });
    expect(detail).toContain("phase=daemon:metrics");
    expect(detail).toContain("jobId=job-1");
    expect(detail).toContain("timeoutMs=1800000");
    expect(detail).toContain("SIGTERM=true");
    expect(detail).toContain("SIGKILL=true");
    expect(detail).toContain("exit=124");
    expect(detail).toContain("resume=npm run growth:metrics");
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

it("daemonとdraft orchestratorは完全なProcessResultからtimeout証跡を配線する", () => {
  const daemon = readFileSync(path.join(process.cwd(), "scripts/growth/daemon-cli.ts"), "utf8");
  expect(daemon).toContain("Promise<ProcessResult>");
  expect(daemon).toContain("buildProcessFailureDetail");
  expect(daemon).toContain("growth:notify-loop-fail");
  expect(daemon).toContain("growth:learning-log");
  expect(daemon).toContain("growth-failures.log");

  const orchestrator = readFileSync(path.join(process.cwd(), "scripts/growth/draft-orchestrator-cli.ts"), "utf8");
  expect(orchestrator).toContain("ProcessExecutionError");
  expect(orchestrator).toContain("buildProcessFailureDetail");
  expect(orchestrator).toContain("growth-failures.log");
  expect(orchestrator).toContain('"124"');
});
