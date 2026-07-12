import { describe, expect, it } from "vitest";

import { SHELL_SEGMENTS, matchesSegment } from "./shellNav";
import type { PendingItem } from "./types";

function item(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "t", subtitle: "", ...over } as PendingItem;
}

describe("shellNav", () => {
  it("4 セグメントを label 付きで持つ", () => {
    expect(SHELL_SEGMENTS.map((s) => s.key)).toEqual(["all", "awaiting", "generating", "published"]);
    expect(SHELL_SEGMENTS[0].label).toBe("すべて");
  });

  it("matchesSegment は stage / isActionable で判定する", () => {
    const idea = item({ id: "i1", kind: "idea", stage: "proposed" });
    const gen = item({ id: "g1", kind: "idea", stage: "generating" });
    const pub = item({ id: "p1", kind: "idea", stage: "published" });
    expect(matchesSegment(idea, "all", {})).toBe(true);
    expect(matchesSegment(idea, "awaiting", {})).toBe(true);
    expect(matchesSegment(idea, "awaiting", { i1: "承認" })).toBe(false);
    expect(matchesSegment(gen, "generating", {})).toBe(true);
    expect(matchesSegment(idea, "generating", {})).toBe(false);
    expect(matchesSegment(pub, "published", {})).toBe(true);
  });
});
