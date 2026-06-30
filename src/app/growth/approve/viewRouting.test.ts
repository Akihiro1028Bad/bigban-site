import { describe, expect, it } from "vitest";

import { APPROVE_VIEWS, decideInitialView, parseView } from "./viewRouting";

describe("parseView", () => {
  it("5 view を正規化し、未知/欠落は null", () => {
    expect(APPROVE_VIEWS).toEqual(["proposal", "approve", "prompt", "performance", "queue"]);
    for (const v of APPROVE_VIEWS) expect(parseView(v)).toBe(v);
    expect(parseView("articles")).toBeNull(); // 旧値は廃止
    expect(parseView(null)).toBeNull();
    expect(parseView(undefined)).toBeNull();
  });
});

describe("decideInitialView", () => {
  it("URL 指定を最優先", () => {
    expect(decideInitialView("queue", { proposalPending: 5, awaiting: 5 })).toBe("queue");
  });
  it("施策未処理>0 で proposal", () => {
    expect(decideInitialView(null, { proposalPending: 1, awaiting: 3 })).toBe("proposal");
  });
  it("施策0・あなた待ち>0 で approve", () => {
    expect(decideInitialView(null, { proposalPending: 0, awaiting: 2 })).toBe("approve");
  });
  it("どちらも0で既定 performance", () => {
    expect(decideInitialView(null, { proposalPending: 0, awaiting: 0 })).toBe("performance");
  });
});
