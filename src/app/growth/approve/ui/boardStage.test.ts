import { describe, expect, it } from "vitest";

import { STAGE_META, STAGE_ORDER, toneVar, toneWeakVar } from "./boardStage";

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
