import { describe, expect, it } from "vitest";

import type { PendingItem } from "@/lib/growth/approve";

import {
  ARTICLE_COLUMNS,
  effectiveStage,
  groupArticlesByStage,
  isAwaitingDownstream,
  scoreBarPct,
  stageStepIndex,
} from "./board";

function idea(id: string, stage: PendingItem["stage"]): PendingItem {
  return {
    id,
    kind: "idea",
    title: id,
    subtitle: "",
    details: [],
    score: 0,
    stage,
  };
}

describe("ARTICLE_COLUMNS", () => {
  it("提案中→生成待ち→生成中→下書き の順", () => {
    expect(ARTICLE_COLUMNS.map((c) => c.stage)).toEqual([
      "proposed",
      "queued",
      "generating",
      "drafted",
    ]);
  });
});

describe("stageStepIndex", () => {
  it("各段階のインデックス", () => {
    expect(stageStepIndex("proposed")).toBe(0);
    expect(stageStepIndex("queued")).toBe(1);
    expect(stageStepIndex("generating")).toBe(2);
    expect(stageStepIndex("drafted")).toBe(3);
  });

  it("却下/未知は -1", () => {
    expect(stageStepIndex("rejected")).toBe(-1);
  });
});

describe("effectiveStage", () => {
  it("承認決定で生成待ちへ前進", () => {
    expect(effectiveStage(idea("a", "proposed"), "承認")).toBe("queued");
  });

  it("却下は元の列に留める(取り消しできるよう)", () => {
    expect(effectiveStage(idea("a", "proposed"), "却下")).toBe("proposed");
  });

  it("未決定は元の段階", () => {
    expect(effectiveStage(idea("a", "drafted"), undefined)).toBe("drafted");
  });
});

describe("isAwaitingDownstream", () => {
  it("queued/generating/approved は true", () => {
    expect(isAwaitingDownstream("queued")).toBe(true);
    expect(isAwaitingDownstream("generating")).toBe(true);
    expect(isAwaitingDownstream("approved")).toBe(true);
  });

  it("proposed/drafted は false", () => {
    expect(isAwaitingDownstream("proposed")).toBe(false);
    expect(isAwaitingDownstream("drafted")).toBe(false);
  });
});

describe("scoreBarPct", () => {
  it("割合を百分率に丸める", () => {
    expect(scoreBarPct(5, 10)).toBe(50);
    expect(scoreBarPct(3, 3)).toBe(100);
  });

  it("max を超えても 100 で頭打ち", () => {
    expect(scoreBarPct(20, 10)).toBe(100);
  });

  it("max<=0 は 0", () => {
    expect(scoreBarPct(5, 0)).toBe(0);
  });
});

describe("groupArticlesByStage", () => {
  it("段階ごとに振り分ける", () => {
    const ideas = [idea("a", "proposed"), idea("b", "drafted"), idea("c", "queued")];
    const grouped = groupArticlesByStage(ideas, {});
    expect(grouped[0].items.map((i) => i.id)).toEqual(["a"]); // proposed
    expect(grouped[1].items.map((i) => i.id)).toEqual(["c"]); // queued
    expect(grouped[3].items.map((i) => i.id)).toEqual(["b"]); // drafted
  });

  it("承認した提案は生成待ち列へ移り、却下は元の列に残る(取り消し可能)", () => {
    const ideas = [idea("a", "proposed"), idea("b", "proposed")];
    const grouped = groupArticlesByStage(ideas, { a: "承認", b: "却下" });
    expect(grouped[0].items.map((i) => i.id)).toEqual(["b"]); // 却下は proposed に残る
    expect(grouped[1].items.map((i) => i.id)).toEqual(["a"]); // 承認は queued へ
  });
});
