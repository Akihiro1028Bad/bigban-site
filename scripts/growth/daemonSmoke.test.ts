import { describe, expect, it, vi } from "vitest";

import {
  resolveNpmCommand,
  runDaemonSmoke,
  type DaemonSmokePorts,
} from "./daemonSmoke";

function ports(files: Map<string, string>, exitCode = 0, kind = "exit"): DaemonSmokePorts {
  return {
    runProcess: vi.fn(async () => ({ exitCode, kind, stdout: "10.0.0\n" })),
    readText: async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error("ENOENT");
      return value;
    },
    makeDirectory: async () => undefined,
    writeText: async (path, value) => { files.set(path, value); },
    rename: async (from, to) => {
      const value = files.get(from);
      if (value === undefined) throw new Error("ENOENT");
      files.set(to, value);
      files.delete(from);
    },
    now: () => new Date("2026-07-16T00:00:00.000Z"),
  };
}

describe("resolveNpmCommand", () => {
  it("Windowsではnpm.cmd、それ以外ではnpmを返す", () => {
    expect(resolveNpmCommand("win32")).toBe("npm.cmd");
    expect(resolveNpmCommand("darwin")).toBe("npm");
  });
});

describe("runDaemonSmoke", () => {
  it("npm --version成功後にstateをatomic writeして再読込する", async () => {
    const files = new Map<string, string>();
    const dependencies = ports(files);
    const result = await runDaemonSmoke("C:/tmp/smoke.json", "win32", dependencies);
    expect(result).toEqual({ isSuccess: true, hadPreviousState: false, npmVersion: "10.0.0" });
    expect(dependencies.runProcess).toHaveBeenCalledWith("npm.cmd", ["--version"]);
    expect(files.has("C:/tmp/smoke.json.tmp")).toBe(false);
    expect(JSON.parse(files.get("C:/tmp/smoke.json") ?? "{}")).toMatchObject({ runCount: 1 });
  });

  it("二度目は前回状態を復元してrunCountを増やす", async () => {
    const files = new Map<string, string>();
    const dependencies = ports(files);
    await runDaemonSmoke("/tmp/smoke.json", "linux", dependencies);
    const result = await runDaemonSmoke("/tmp/smoke.json", "linux", dependencies);
    expect(result.hadPreviousState).toBe(true);
    expect(JSON.parse(files.get("/tmp/smoke.json") ?? "{}")).toMatchObject({ runCount: 2 });
  });

  it("壊れたstateは前回状態なしとして復旧する", async () => {
    const files = new Map([["/tmp/smoke.json", "broken"]]);
    const result = await runDaemonSmoke("/tmp/smoke.json", "linux", ports(files));
    expect(result.hadPreviousState).toBe(false);
  });

  it.each([
    [1, "exit"],
    [1, "spawn-error"],
  ])("非0終了またはspawn errorを成功扱いしない", async (exitCode, kind) => {
    const files = new Map<string, string>();
    const result = await runDaemonSmoke("/tmp/smoke.json", "linux", ports(files, exitCode, kind));
    expect(result.isSuccess).toBe(false);
    expect(files.size).toBe(0);
  });

  it("exitCode 0でもspawn errorは成功扱いしない", async () => {
    const result = await runDaemonSmoke("/tmp/smoke.json", "linux", ports(new Map(), 0, "spawn-error"));
    expect(result.isSuccess).toBe(false);
  });
});
