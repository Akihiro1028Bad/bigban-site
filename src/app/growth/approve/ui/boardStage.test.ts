import { describe, expect, it } from "vitest";

import { STAGE_META, STAGE_ORDER, deriveBoardStage, toneVar, toneWeakVar } from "./boardStage";

import type { PendingItem } from "../types";

function pi(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "t", subtitle: "", ...over } as PendingItem;
}

describe("boardStage", () => {
  it("6 ステージの label/tone/order を持つ", () => {
    expect(Object.keys(STAGE_META)).toHaveLength(6);
    expect(STAGE_META.outline_review).toEqual({ label: "構成案レビュー", tone: "amber", order: 0 });
    expect(STAGE_META.published).toEqual({ label: "公開済み", tone: "green", order: 5 });
  });

  it("STAGE_ORDER は order 昇順", () => {
    expect(STAGE_ORDER).toEqual([
      "outline_review",
      "draft_review",
      "generating",
      "scheduled",
      "idea",
      "published",
    ]);
  });

  it("toneVar は gray を text-3 に写像、他は同名トークン", () => {
    expect(toneVar("gray")).toBe("var(--p-text-3)");
    expect(toneVar("accent")).toBe("var(--p-accent)");
  });

  it("toneWeakVar は gray を白6%、他は -weak トークン", () => {
    expect(toneWeakVar("gray")).toBe("rgba(255,255,255,0.06)");
    expect(toneWeakVar("amber")).toBe("var(--p-amber-weak)");
  });
});

describe("deriveBoardStage", () => {
  it("施策(proposal)は idea", () => {
    expect(deriveBoardStage(pi({ id: "p1", kind: "proposal", stage: "proposed" }))).toBe("idea");
  });
  it("published は published", () => {
    expect(deriveBoardStage(pi({ id: "a1", kind: "idea", stage: "published" }))).toBe("published");
  });
  it("generating は generating", () => {
    expect(deriveBoardStage(pi({ id: "a2", kind: "idea", stage: "generating" }))).toBe("generating");
  });
  it("drafted は draft_review", () => {
    expect(deriveBoardStage(pi({ id: "a3", kind: "idea", stage: "drafted" }))).toBe("draft_review");
  });
  it("isDraftReady=true は stage に依らず draft_review", () => {
    expect(deriveBoardStage(pi({ id: "a4", kind: "idea", stage: "queued", isDraftReady: true }))).toBe("draft_review");
  });
  it("proposed/queued(下書き未) は outline_review", () => {
    expect(deriveBoardStage(pi({ id: "a5", kind: "idea", stage: "proposed" }))).toBe("outline_review");
    expect(deriveBoardStage(pi({ id: "a6", kind: "idea", stage: "queued" }))).toBe("outline_review");
  });
  it("drafted かつ scheduledAtMs があれば scheduled", () => {
    expect(deriveBoardStage(pi({ id: "s1", kind: "idea", stage: "drafted", scheduledAtMs: 1_000 }))).toBe("scheduled");
  });
  it("isDraftReady かつ scheduledAtMs があれば scheduled", () => {
    expect(deriveBoardStage(pi({ id: "s2", kind: "idea", stage: "queued", isDraftReady: true, scheduledAtMs: 1_000 }))).toBe("scheduled");
  });
  it("scheduledAtMs が null/未設定なら draft_review 側に寄る", () => {
    expect(deriveBoardStage(pi({ id: "s3", kind: "idea", stage: "drafted", scheduledAtMs: null }))).toBe("draft_review");
    expect(deriveBoardStage(pi({ id: "s4", kind: "idea", stage: "drafted" }))).toBe("draft_review");
  });
  it("published は scheduledAtMs があっても published", () => {
    expect(deriveBoardStage(pi({ id: "s5", kind: "idea", stage: "published", scheduledAtMs: 1_000 }))).toBe("published");
  });
});
