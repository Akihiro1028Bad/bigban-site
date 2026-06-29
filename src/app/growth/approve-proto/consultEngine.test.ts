import { describe, expect, it } from "vitest";

import {
  applyReviseTarget,
  createConsult,
  failConsult,
  findConsult,
  removeConsult,
  resolveConsult,
  settleReviseTarget,
  upsertConsult,
} from "./consultEngine";
import type { Article, Consult } from "./types";

describe("consultEngine: 基本ライフサイクル", () => {
  it("createConsult は requested 状態の相談を作る", () => {
    const c = createConsult("c1", "overall", { overall: { focus: "導入" } });
    expect(c).toEqual({
      id: "c1",
      kind: "overall",
      status: "requested",
      input: { overall: { focus: "導入" } },
    });
  });

  it("upsertConsult は新規を追加し、既存idは置換する(イミュータブル)", () => {
    const a = createConsult("c1", "overall", {});
    const list1 = upsertConsult([], a);
    expect(list1).toHaveLength(1);

    const a2: Consult = { ...a, status: "presenting" };
    const list2 = upsertConsult(list1, a2);
    expect(list2).toHaveLength(1);
    expect(list2[0].status).toBe("presenting");
    expect(list1[0].status).toBe("requested"); // 元配列は不変
  });

  it("findConsult は id 一致を返し、無ければ undefined", () => {
    const a = createConsult("c1", "revise", {});
    expect(findConsult([a], "c1")).toBe(a);
    expect(findConsult([a], "zzz")).toBeUndefined();
  });

  it("removeConsult は id を除いた新配列を返す", () => {
    const a = createConsult("c1", "revise", {});
    const b = createConsult("c2", "sentence", {});
    const out = removeConsult([a, b], "c1");
    expect(out.map((c) => c.id)).toEqual(["c2"]);
  });
});

describe("consultEngine: resolve/fail", () => {
  it("resolveConsult は presenting にして result を載せる", () => {
    const c = createConsult("c1", "overall", {});
    const out = resolveConsult(c, { overall: { overall: 80, scores: [], strengths: [], fixes: [] } });
    expect(out.status).toBe("presenting");
    expect(out.result?.overall?.overall).toBe(80);
    expect(c.status).toBe("requested"); // 元は不変
  });

  it("failConsult は failed にして result を落とす", () => {
    const c = resolveConsult(createConsult("c1", "revise", {}), { revise: {} });
    const out = failConsult(c);
    expect(out.status).toBe("failed");
    expect(out.result).toBeUndefined();
  });
});

function stubArticle(over: Partial<Article> = {}): Article {
  return {
    id: "a1", title: "元タイトル", stage: "draft_review", score: 50, awaitingYou: true,
    updatedLabel: "", excerpt: "", keyword: "", hue: 0, wordCount: 0, readMinutes: 0,
    outline: [{ heading: "元見出し", summary: "" }], prompt: "", refs: [],
    bodyHtml: "<p>元本文</p>", hasEyecatch: false, bodyImages: 0, decorations: 0,
    advice: { overall: 0, scores: [], strengths: [], fixes: [] }, checklist: [],
    ...over,
  };
}

describe("consultEngine: revise の反映/残り", () => {
  const c = resolveConsult(createConsult("c1", "revise", {}), {
    revise: {
      title: { from: "元タイトル", to: "新タイトル" },
      body: { from: "<p>元本文</p>", to: "<p>新本文</p>" },
    },
  });

  it("applyReviseTarget(title) はタイトルだけ差し替える", () => {
    const out = applyReviseTarget(stubArticle(), c, "title");
    expect(out.title).toBe("新タイトル");
    expect(out.bodyHtml).toBe("<p>元本文</p>");
  });

  it("applyReviseTarget(body) は本文だけ差し替える", () => {
    const out = applyReviseTarget(stubArticle(), c, "body");
    expect(out.bodyHtml).toBe("<p>新本文</p>");
    expect(out.title).toBe("元タイトル");
  });

  it("applyReviseTarget(outline) は outline を差し替える", () => {
    const co = resolveConsult(createConsult("c2", "revise", {}), {
      revise: { outline: { from: [{ heading: "元見出し", summary: "" }], to: [{ heading: "新見出し", summary: "x" }] } },
    });
    const out = applyReviseTarget(stubArticle(), co, "outline");
    expect(out.outline).toEqual([{ heading: "新見出し", summary: "x" }]);
  });

  it("settleReviseTarget は対象を除き、残りがあれば presenting のまま", () => {
    const out = settleReviseTarget(c, "title");
    expect(out).not.toBeNull();
    expect(out?.result?.revise?.title).toBeUndefined();
    expect(out?.result?.revise?.body).toBeDefined();
    expect(out?.status).toBe("presenting");
  });

  it("settleReviseTarget は最後の対象を除くと null(相談終了)", () => {
    const only = resolveConsult(createConsult("c3", "revise", {}), {
      revise: { title: { from: "a", to: "b" } },
    });
    expect(settleReviseTarget(only, "title")).toBeNull();
  });
});
