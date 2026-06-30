import { describe, expect, it } from "vitest";

import { deriveShellCounts, syncAgoLabel } from "./boardShellStats";
import type { PendingItem } from "./types";

function item(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "t", subtitle: "", ...over } as PendingItem;
}

describe("deriveShellCounts", () => {
  const items: PendingItem[] = [
    item({ id: "p1", kind: "proposal", stage: "proposed" }), // 施策・未処理
    item({ id: "p2", kind: "proposal", stage: "proposed" }), // 施策・決定済み
    item({ id: "i1", kind: "idea", stage: "proposed" }),     // 記事・未処理
    item({ id: "g1", kind: "idea", stage: "generating" }),   // 生成中
    item({ id: "d1", kind: "idea", stage: "drafted", isDraftReady: true }),  // 公開キュー ready
    item({ id: "pub1", kind: "idea", stage: "published" }),  // 公開済み
  ];
  const decided = { p2: "承認" };

  it("セグメント件数を stage / isActionable で算出する", () => {
    const c = deriveShellCounts(items, decided);
    expect(c.segmentCounts.all).toBe(6);
    expect(c.segmentCounts.generating).toBe(1);
    expect(c.segmentCounts.published).toBe(1);
    // awaiting=未決定で actionable(p1,i1)。p2 は決定済み・d1 は isDraftReady・g1 は下流待ち・pub1 は published。
    expect(c.segmentCounts.awaiting).toBe(2);
    expect(c.awaiting).toBe(2);
  });

  it("施策の未処理 / 公開キュー ready / 公開済み(縮約=総数) を算出する", () => {
    const c = deriveShellCounts(items, decided);
    expect(c.proposalPending).toBe(1); // p1 のみ(p2 は決定済み)
    expect(c.queueReady).toBe(1);      // d1
    expect(c.publishedTotal).toBe(1);  // pub1
  });

  it("空配列でも 0 を返す", () => {
    const c = deriveShellCounts([], {});
    expect(c.awaiting).toBe(0);
    expect(c.segmentCounts.all).toBe(0);
  });
});

describe("syncAgoLabel", () => {
  it("未取得(null)は label=null stale=false", () => {
    expect(syncAgoLabel(1_000_000, null)).toEqual({ label: null, stale: false });
  });

  it("1分未満は『たった今』", () => {
    expect(syncAgoLabel(1_030_000, 1_000_000)).toEqual({ label: "たった今", stale: false });
  });

  it("1分以上2分未満は『N分前』stale=false", () => {
    expect(syncAgoLabel(1_090_000, 1_000_000)).toEqual({ label: "1分前", stale: false });
  });

  it("2分以上は stale=true", () => {
    expect(syncAgoLabel(1_200_000, 1_000_000)).toEqual({ label: "3分前", stale: true });
  });

  it("時計巻き戻し(負経過)は『たった今』に丸める", () => {
    expect(syncAgoLabel(900_000, 1_000_000)).toEqual({ label: "たった今", stale: false });
  });
});
