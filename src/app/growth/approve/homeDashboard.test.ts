import { describe, expect, it } from "vitest";

import { dashboardViewOf } from "./homeDashboard";
import type { PendingItem } from "./types";

function item(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "項目", subtitle: "", ...over } as PendingItem;
}

describe("dashboardViewOf", () => {
  it("既存盤から4カードとパイプラインを集計する", () => {
    const items = [
      item({ id: "p1", kind: "proposal", stage: "proposed" }),
      item({ id: "p2", kind: "proposal", stage: "executed" }),
      item({ id: "i1", kind: "idea", stage: "proposed" }),
      item({ id: "i2", kind: "idea", stage: "drafted", isDraftReady: true, eyecatchUrl: "https://images.microcms-assets.io/a.jpg", hasDraftBody: true }),
      item({ id: "i3", kind: "idea", stage: "drafted", isDraftReady: false, hasDraftBody: true }),
      item({ id: "i4", kind: "idea", stage: "published" }),
    ];

    expect(dashboardViewOf(items, {})).toMatchObject({
      proposalPending: 1,
      articleAwaiting: 1,
      publishReady: 1,
      publishBlocked: 1,
      pipeline: { proposals: 2, production: 3, publishWaiting: 2, published: 1 },
    });
  });

  it("空配列はすべて0", () => {
    expect(dashboardViewOf([], {})).toEqual({
      proposalPending: 0,
      articleAwaiting: 0,
      publishReady: 0,
      publishBlocked: 0,
      pipeline: { proposals: 0, production: 0, publishWaiting: 0, published: 0 },
    });
  });
});
