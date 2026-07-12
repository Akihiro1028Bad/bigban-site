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
});
