import { afterEach, describe, expect, it } from "vitest";

import { APPROVE_VIEWS, decideInitialView, initialDraftFromUrl, parseView } from "./viewRouting";

describe("parseView", () => {
  it("5 view を正規化し、未知/欠落は null", () => {
    expect(APPROVE_VIEWS).toEqual(["proposal", "approve", "prompt", "performance", "queue"]);
    for (const v of APPROVE_VIEWS) expect(parseView(v)).toBe(v);
    expect(parseView("articles")).toBeNull(); // 旧値は廃止
    expect(parseView(null)).toBeNull();
    expect(parseView(undefined)).toBeNull();
  });
});

describe("initialDraftFromUrl", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("URL の draft パラメータ(=contentId)を読み取る", () => {
    window.history.replaceState(null, "", "/?view=approve&draft=g-abc123");
    expect(initialDraftFromUrl()).toBe("g-abc123");
  });

  it("draft が無ければ null", () => {
    window.history.replaceState(null, "", "/?view=approve");
    expect(initialDraftFromUrl()).toBeNull();
  });

  it("draft が空文字なら null(空 id を選択対象にしない)", () => {
    window.history.replaceState(null, "", "/?draft=");
    expect(initialDraftFromUrl()).toBeNull();
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
