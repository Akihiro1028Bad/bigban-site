import { describe, expect, it, vi } from "vitest";

import {
  runDraftOrchestratorApplication,
  runWithDraftWorkDirCleanup,
  type DraftOrchestratorApplicationPorts,
} from "./draftOrchestratorApplication";

function ports(events: string[]): DraftOrchestratorApplicationPorts<string, number, boolean> {
  return {
    acquireTarget: async () => { events.push("target"); return "page"; },
    resolveSettings: async () => { events.push("settings"); return 7; },
    runResearch: async (target, settings) => { events.push(`research:${target}:${settings}`); return true; },
    runWriter: async (target, settings, research) => { events.push(`writer:${target}:${settings}:${research}`); return "writer"; },
    runImagePrompt: async (writer) => { events.push(`image:${writer}`); },
    publishDraft: async (writer) => { events.push(`publish:${writer}`); return { isPartial: false }; },
    notify: async (target) => { events.push(`notify:${target}`); },
    recordPartial: async () => { events.push("partial"); },
    cleanup: async () => { events.push("cleanup"); },
  };
}

describe("runDraftOrchestratorApplication", () => {
  it("工程順を守り、工程間でデータを引き継ぐ", async () => {
    const events: string[] = [];

    await runDraftOrchestratorApplication(ports(events));

    expect(events).toEqual([
      "target", "settings", "research:page:7", "writer:page:7:true",
      "image:writer", "publish:writer", "notify:page", "cleanup",
    ]);
  });

  it("partial のときだけ学習ログを記録する", async () => {
    const events: string[] = [];
    const dependencies = ports(events);
    dependencies.publishDraft = async () => ({ isPartial: true, recoveryCommand: "resume" });

    await runDraftOrchestratorApplication(dependencies);

    expect(events).toContain("partial");
  });

  it("中間工程が失敗したら後続工程を実行せず、一時資源は解放する", async () => {
    const events: string[] = [];
    const dependencies = ports(events);
    dependencies.runResearch = async () => { events.push("research"); throw new Error("boom"); };
    dependencies.cleanup = vi.fn(async () => { events.push("cleanup"); });

    await expect(runDraftOrchestratorApplication(dependencies)).rejects.toThrow("boom");
    expect(events).toEqual(["target", "settings", "research", "cleanup"]);
    expect(dependencies.cleanup).toHaveBeenCalledOnce();
  });

  it("通知失敗時にも一時資源を解放する", async () => {
    const events: string[] = [];
    const dependencies = ports(events);
    dependencies.notify = async () => { throw new Error("notify failed"); };

    await expect(runDraftOrchestratorApplication(dependencies)).rejects.toThrow("notify failed");
    expect(events.at(-1)).toBe("cleanup");
  });
});

describe("runWithDraftWorkDirCleanup", () => {
  it("writer用ディレクトリ作成失敗時も先に作ったresearch用を解放する", async () => {
    const directories: string[] = [];
    const cleaned: string[][] = [];

    await expect(runWithDraftWorkDirCleanup(
      directories,
      async () => {
        directories.push("/tmp/research");
        throw new Error("writer mkdtemp failed");
      },
      async (created) => { cleaned.push([...created]); },
    )).rejects.toThrow("writer mkdtemp failed");

    expect(cleaned).toEqual([["/tmp/research"]]);
  });
});
