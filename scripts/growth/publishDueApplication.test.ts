import { describe, expect, it } from "vitest";

import {
  runPublishDueApplication,
  type PublishDueApplicationPorts,
  type PublishDueCandidate,
} from "./publishDueApplication";

const first: PublishDueCandidate = {
  pageId: "page-1", contentId: "content-1", title: "one", endpoint: "news",
  patch: { title: "one" },
};

function ports(
  events: string[],
  candidates: PublishDueCandidate[] = [first],
  dueCount = candidates.length,
): PublishDueApplicationPorts<PublishDueCandidate> {
  return {
    fetchDueItems: async () => { events.push("fetch"); return { items: candidates, total: dueCount }; },
    prepareCandidate: async (item) => { events.push(`prepare:${item.pageId}`); return item; },
    patchDraft: async (item) => { events.push(`patch:${item.pageId}`); },
    publishContent: async (item) => { events.push(`publish:${item.pageId}`); },
    updatePublishedStatus: async (item) => { events.push(`status:${item.pageId}`); },
    clearSchedule: async (item) => { events.push(`clear:${item.pageId}`); },
    notifyLine: async (message) => { events.push(`line:${message}`); },
    warn: (message) => { events.push(`warn:${message}`); },
  };
}

describe("runPublishDueApplication", () => {
  it("patch→publish→status→clear→LINE の順で処理する", async () => {
    const events: string[] = [];
    const result = await runPublishDueApplication(ports(events), { isDryRun: false, nowMs: 10 });
    expect(result).toEqual({ due: 1, published: 1, partial: [] });
    expect(events).toEqual([
      "fetch", "prepare:page-1", "patch:page-1", "publish:page-1", "status:page-1", "clear:page-1",
      "line:⏰ 予約公開: 1件 (対象 1件)",
    ]);
  });

  it("同期patchが空ならpatchを省略する", async () => {
    const events: string[] = [];
    await runPublishDueApplication(ports(events, [{ ...first, patch: null }]), { isDryRun: false, nowMs: 10 });
    expect(events.some((event) => event.startsWith("patch:"))).toBe(false);
  });

  it("microCMS成功後のNotion失敗はpartialとして次の記事へ進む", async () => {
    const events: string[] = [];
    const dependencies = ports(events, [
      { ...first, title: "" },
      { ...first, pageId: "page-2", contentId: "content-2" },
    ]);
    dependencies.updatePublishedStatus = async (item) => {
      events.push(`status:${item.pageId}`);
      throw new Error("notion");
    };
    const result = await runPublishDueApplication(dependencies, { isDryRun: false, nowMs: 10 });
    expect(result.published).toBe(2);
    expect(result.partial).toEqual([
      { title: "", contentId: "content-1" },
      { title: "one", contentId: "content-2" },
    ]);
    expect(events).toContain("publish:page-2");
    expect(events).not.toContain("clear:page-1");
  });

  it("予約消去失敗は警告だけで成功を維持する", async () => {
    const events: string[] = [];
    const dependencies = ports(events, [{ ...first, title: "" }]);
    dependencies.clearSchedule = async () => { throw new Error("clear"); };
    const result = await runPublishDueApplication(dependencies, { isDryRun: false, nowMs: 10 });
    expect(result.published).toBe(1);
    expect(events.some((event) => event.includes("予約消去"))).toBe(true);
  });

  it("dry-runは候補取得以外の外部書き込みをしない", async () => {
    const events: string[] = [];
    const result = await runPublishDueApplication(ports(events), { isDryRun: true, nowMs: 10 });
    expect(result).toEqual({ due: 1, published: 0, partial: [] });
    expect(events).toEqual(["fetch", "prepare:page-1"]);
  });

  it("microCMS公開失敗時はその記事の後続処理をしない", async () => {
    const events: string[] = [];
    const dependencies = ports(events);
    dependencies.publishContent = async (item) => { events.push(`publish:${item.pageId}`); throw new Error("microcms"); };
    await expect(runPublishDueApplication(dependencies, { isDryRun: false, nowMs: 10 })).rejects.toThrow("microcms");
    expect(events).toEqual(["fetch", "prepare:page-1", "patch:page-1", "publish:page-1"]);
  });

  it("候補がなければ通知しない", async () => {
    const events: string[] = [];
    const result = await runPublishDueApplication(ports(events, []), { isDryRun: false, nowMs: 10 });
    expect(result).toEqual({ due: 0, published: 0, partial: [] });
    expect(events).toEqual(["fetch"]);
  });

  it("各記事を準備から公開まで完了してから次の記事を評価する", async () => {
    const events: string[] = [];
    const second = { ...first, pageId: "page-2", contentId: "content-2" };

    await runPublishDueApplication(ports(events, [first, second]), { isDryRun: false, nowMs: 10 });

    expect(events.indexOf("clear:page-1")).toBeLessThan(events.indexOf("prepare:page-2"));
  });

  it("ゲート除外があってもLINEの対象件数は到来予約総数を使う", async () => {
    const events: string[] = [];
    const dependencies = ports(events, [first], 2);
    dependencies.prepareCandidate = async (item) => {
      events.push(`prepare:${item.pageId}`);
      return item;
    };

    await runPublishDueApplication(dependencies, { isDryRun: false, nowMs: 10 });

    expect(events).toContain("line:⏰ 予約公開: 1件 (対象 2件)");
  });

  it("準備で除外された記事は公開I/Oを行わない", async () => {
    const events: string[] = [];
    const dependencies = ports(events);
    dependencies.prepareCandidate = async (item) => {
      events.push(`prepare:${item.pageId}`);
      return null;
    };

    expect(await runPublishDueApplication(dependencies, { isDryRun: false, nowMs: 10 }))
      .toEqual({ due: 1, published: 0, partial: [] });
    expect(events).toEqual(["fetch", "prepare:page-1"]);
  });
});
