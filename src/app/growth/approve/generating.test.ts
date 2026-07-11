import { describe, expect, it } from "vitest";

import type { Stage } from "@/lib/growth/stage";

import {
  GENERATING_STEPS,
  isInFlight,
  isStuck,
  newlyDraftedIds,
} from "./generating";

function item(id: string, stage: Stage): { id: string; stage: Stage } {
  return { id, stage };
}

describe("GENERATING_STEPS", () => {
  it("取材→構成→推敲 の3段", () => {
    expect(GENERATING_STEPS).toEqual(["取材", "構成", "推敲"]);
  });
});

describe("isStuck", () => {
  it("閾値以上で滞留", () => {
    expect(isStuck(1000, 1000)).toBe(true);
    expect(isStuck(1500, 1000)).toBe(true);
  });

  it("閾値未満は滞留でない", () => {
    expect(isStuck(999, 1000)).toBe(false);
  });
});

describe("isInFlight", () => {
  it("queued/generating は true", () => {
    expect(isInFlight("queued")).toBe(true);
    expect(isInFlight("generating")).toBe(true);
  });

  it("proposed/drafted は false", () => {
    expect(isInFlight("proposed")).toBe(false);
    expect(isInFlight("drafted")).toBe(false);
  });
});

describe("newlyDraftedIds", () => {
  it("新たに drafted になった id を返す", () => {
    const prev = [item("a", "generating"), item("b", "drafted")];
    const next = [item("a", "drafted"), item("b", "drafted")];
    expect(newlyDraftedIds(prev, next)).toEqual(["a"]);
  });

  it("元から drafted のものは含めない", () => {
    const prev = [item("b", "drafted")];
    const next = [item("b", "drafted")];
    expect(newlyDraftedIds(prev, next)).toEqual([]);
  });

  it("drafted でない最新は含めない", () => {
    const prev = [item("a", "queued")];
    const next = [item("a", "generating")];
    expect(newlyDraftedIds(prev, next)).toEqual([]);
  });
});
