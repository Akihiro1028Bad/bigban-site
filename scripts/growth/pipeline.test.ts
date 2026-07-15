// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { canRestoreGeneratedFile, createSpecHash, runStages, type PipelineCheckpoint, type Stage } from "./pipeline";

describe("runStages", () => {
  it("生成ファイルのpathと実在を復元条件にする", () => {
    const exists = vi.fn((filePath: string) => filePath === "/state/image.png");
    expect(canRestoreGeneratedFile({ imagePath: "/state/image.png" }, exists)).toBe(true);
    expect(canRestoreGeneratedFile({ imagePath: "/tmp/missing.png" }, exists)).toBe(false);
    expect(canRestoreGeneratedFile({ imagePath: 1 }, exists)).toBe(false);
    expect(canRestoreGeneratedFile(null, exists)).toBe(false);
  });
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
    expect(r.events.at(-1)).toMatchObject({ stage: "create", event: "failed" });
  });

  it("成功出力をcheckpointへ保存し、再開時はrestoreして成功prefixをskipする", async () => {
    const create = vi.fn(async () => ({ contentId: "content-1" }));
    const patch = vi.fn(async () => ({ done: true }));
    const restored: unknown[] = [];
    const checkpoints: PipelineCheckpoint[] = [];
    const stages: Stage[] = [
      { name: "create", run: create, restore: (output) => restored.push(output) },
      { name: "patch", run: patch },
    ];
    const first = await runStages(stages, vi.fn(), {
      specHash: createSpecHash("spec"),
      onCheckpoint: (checkpoint) => { checkpoints.push(checkpoint); },
    });
    const resumed = await runStages(stages, vi.fn(), {
      specHash: createSpecHash("spec"),
      checkpoint: checkpoints.at(-1),
    });

    expect(first.outputs.create).toEqual({ contentId: "content-1" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(restored).toEqual([{ contentId: "content-1" }]);
    expect(resumed.events.map((event) => event.event)).toEqual(["skipped", "skipped"]);
  });

  it("失敗stage以降だけ実行し、hash不一致・壊れた非prefix checkpointは不使用", async () => {
    const ran: string[] = [];
    const stages: Stage[] = [
      { name: "a", run: async () => void ran.push("a") },
      { name: "b", run: async () => void ran.push("b") },
    ];
    await runStages(stages, vi.fn(), {
      specHash: "new",
      checkpoint: { version: 1, specHash: "old", completed: [{ stage: "a", output: 1 }] },
    });
    expect(ran).toEqual(["a", "b"]);
    ran.length = 0;
    await runStages(stages, vi.fn(), {
      specHash: "same",
      checkpoint: { version: 1, specHash: "same", completed: [{ stage: "b", output: 1 }] },
    });
    expect(ran).toEqual(["a", "b"]);
  });

  it("started/succeeded/skippedイベントを順序通り通知する", async () => {
    const events: string[] = [];
    await runStages([{ name: "a", run: async () => "out" }], vi.fn(), {
      now: () => "now",
      onEvent: (event) => events.push(`${event.event}:${event.at}`),
    });
    expect(events).toEqual(["started:now", "succeeded:now"]);
  });

  it("復元条件を満たさないstageから後続checkpointを破棄して再実行する", async () => {
    const ran: string[] = [];
    const stages: Stage[] = [
      { name: "create", run: async () => void ran.push("create") },
      {
        name: "eyecatch:generate",
        canRestore: async (output) => output === "exists",
        run: async () => void ran.push("generate"),
      },
      { name: "eyecatch:upload", run: async () => void ran.push("upload") },
    ];
    const result = await runStages(stages, vi.fn(), {
      specHash: "same",
      checkpoint: {
        version: 1,
        specHash: "same",
        completed: [
          { stage: "create", output: "content" },
          { stage: "eyecatch:generate", output: "missing" },
          { stage: "eyecatch:upload", output: "asset" },
        ],
      },
    });
    expect(ran).toEqual(["generate", "upload"]);
    expect(result.events.map((event) => event.event)).toEqual(["skipped", "started", "succeeded", "started", "succeeded"]);
  });
});
