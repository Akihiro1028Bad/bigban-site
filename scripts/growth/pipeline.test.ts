// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { runStages, type Stage } from "./pipeline";

describe("runStages", () => {
  it("全ステージ成功で completed を全件・failedAt は null", async () => {
    const order: string[] = [];
    const log = vi.fn();
    const stages: Stage[] = [
      { name: "create", run: async () => void order.push("create") },
      { name: "upload", run: async () => void order.push("upload") },
    ];
    const r = await runStages(stages, log);
    expect(r.completed).toEqual(["create", "upload"]);
    expect(r.failedAt).toBeNull();
    expect(order).toEqual(["create", "upload"]);
    // 各ステージで開始/完了ログ
    expect(log).toHaveBeenCalledWith("▶ create");
    expect(log).toHaveBeenCalledWith("✓ create");
  });

  it("途中失敗で停止し、失敗工程を記録・以降は実行しない", async () => {
    const ran: string[] = [];
    const log = vi.fn();
    const stages: Stage[] = [
      { name: "create", run: async () => void ran.push("create") },
      {
        name: "eyecatch:upload",
        run: async () => {
          ran.push("upload");
          throw new Error("504 gateway timeout");
        },
      },
      { name: "notion", run: async () => void ran.push("notion") },
    ];
    const r = await runStages(stages, log);
    expect(r.completed).toEqual(["create"]);
    expect(r.failedAt).toEqual({
      name: "eyecatch:upload",
      error: "504 gateway timeout",
    });
    expect(ran).toEqual(["create", "upload"]); // notion は実行されない
    expect(log).toHaveBeenCalledWith("✗ eyecatch:upload: 504 gateway timeout");
  });

  it("非Error の throw も文字列化して記録する", async () => {
    const log = vi.fn();
    const stages: Stage[] = [
      {
        name: "create",
        run: async () => {
          throw "boom";
        },
      },
    ];
    const r = await runStages(stages, log);
    expect(r.failedAt).toEqual({ name: "create", error: "boom" });
  });
});
