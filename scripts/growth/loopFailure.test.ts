import { describe, expect, it } from "vitest";

import { buildLoopFailureMessage } from "./loopFailure";

describe("buildLoopFailureMessage", () => {
  it("claude 起動失敗(spawn error)を工程名・再開コマンド付きで伝える", () => {
    const msg = buildLoopFailureMessage({
      mode: "revise",
      resumeCommand: "npm run growth:revise-loop",
      kind: "spawn-error",
      detail: "spawn claude ENOENT",
    });
    expect(msg).toContain("revise");
    expect(msg).toContain("起動できませんでした");
    expect(msg).toContain("npm run growth:revise-loop");
    expect(msg).toContain("spawn claude ENOENT");
  });

  it("非0 exit を終了コード付きで伝える(reap/next が回らない)", () => {
    const msg = buildLoopFailureMessage({
      mode: "advise",
      resumeCommand: "npm run growth:advise-loop",
      kind: "nonzero-exit",
      exitCode: 3,
    });
    expect(msg).toContain("advise");
    expect(msg).toContain("異常終了");
    expect(msg).toContain("3");
    expect(msg).toContain("npm run growth:advise-loop");
  });

  it("exitCode 未指定の非0 exit は ? で表示する(欠落耐性)", () => {
    const msg = buildLoopFailureMessage({
      mode: "apply",
      resumeCommand: "npm run growth:advise-apply-loop",
      kind: "nonzero-exit",
    });
    expect(msg).toContain("exit ?");
  });

  it("detail が無い/空でも本文が成立する(exit ケース)", () => {
    const msg = buildLoopFailureMessage({
      mode: "decorate",
      resumeCommand: "npm run growth:decorate-loop",
      kind: "nonzero-exit",
      exitCode: 1,
      detail: "   ",
    });
    expect(msg).not.toContain("詳細:");
    expect(msg).toContain("decorate");
  });

  it("timeout は工程・制限時間・終了シグナル・再開コマンドを伝える", () => {
    const msg = buildLoopFailureMessage({
      mode: "draft-write",
      resumeCommand: "npm run growth:drafts",
      kind: "timeout",
      exitCode: 124,
      timeoutMs: 5_400_000,
      termSent: true,
      forceKilled: false,
    });
    expect(msg).toContain("draft-write");
    expect(msg).toContain("5400000ms");
    expect(msg).toContain("SIGTERM");
    expect(msg).toContain("npm run growth:drafts");
    expect(msg).not.toContain("SIGKILL を使用");
  });

  it("timeout の強制 kill を明記する", () => {
    const msg = buildLoopFailureMessage({ mode: "revise", resumeCommand: "npm run growth:revise-loop", kind: "timeout", timeoutMs: 1, termSent: true, forceKilled: true });
    expect(msg).toContain("SIGKILL を使用");
  });

  it("timeout情報欠落時も安全な文面にする", () => {
    const msg = buildLoopFailureMessage({ mode: "weekly", resumeCommand: "npm run growth:weekly", kind: "timeout" });
    expect(msg).toContain("制限 ?ms");
    expect(msg).toContain("SIGTERM 未送信");
  });
});
