import { describe, expect, it } from "vitest";

import { APPROVE_VIEWS, decideInitialView, parseView } from "./viewRouting";

describe("parseView", () => {
  it("妥当な値はそのまま返す", () => {
    expect(parseView("proposals")).toBe("proposals");
    expect(parseView("articles")).toBe("articles");
  });
  it("未知/欠落は null", () => {
    expect(parseView("foo")).toBeNull();
    expect(parseView("")).toBeNull();
    expect(parseView(null)).toBeNull();
    expect(parseView(undefined)).toBeNull();
  });
});

describe("decideInitialView", () => {
  it("URL の view が妥当ならそれを最優先で使う", () => {
    expect(decideInitialView("articles", { proposals: 5, articles: 0 })).toBe("articles");
    expect(decideInitialView("proposals", { proposals: 0, articles: 5 })).toBe("proposals");
  });
  it("view 未指定: 施策に未処理があれば施策(両方あっても施策優先)", () => {
    expect(decideInitialView(null, { proposals: 2, articles: 3 })).toBe("proposals");
    expect(decideInitialView(null, { proposals: 2, articles: 0 })).toBe("proposals");
  });
  it("view 未指定: 施策ゼロ・記事ありなら記事", () => {
    expect(decideInitialView(null, { proposals: 0, articles: 3 })).toBe("articles");
  });
  it("view 未指定: どちらもゼロなら既定で施策", () => {
    expect(decideInitialView(null, { proposals: 0, articles: 0 })).toBe("proposals");
  });
  it("不正な view 値は無視してフォールバックする", () => {
    expect(decideInitialView("xxx", { proposals: 0, articles: 1 })).toBe("articles");
  });
});

describe("APPROVE_VIEWS", () => {
  it("施策・記事の2タブ", () => {
    expect(APPROVE_VIEWS).toEqual(["proposals", "articles"]);
  });
});
