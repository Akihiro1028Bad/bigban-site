// @vitest-environment node
import { describe, it, expect } from "vitest";

import { CTA_EVENTS as QUERY_CTA_EVENTS } from "./ctaEvents.mjs";

import { CTA_EVENTS } from "@/lib/analytics/events";

describe("分析スクリプトの CTA イベント一覧", () => {
  it("正典 src/lib/analytics/events.ts の CTA_EVENTS と一致する(ドリフト検知)", () => {
    expect([...QUERY_CTA_EVENTS].sort()).toEqual(
      [...Object.values(CTA_EVENTS)].sort(),
    );
  });
});
