import { describe, expect, it } from "vitest";

import {
  adoptAdviceFix,
  applyReviseTarget,
  createConsult,
  failConsult,
  findConsult,
  removeConsult,
  resolveConsult,
  settleSentenceFix,
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

    // 既存を置換する際、他の要素は維持
    const b = createConsult("c2", "sentence", {});
    const list3 = upsertConsult(list2, b);
    expect(list3).toHaveLength(2);
    const updated = upsertConsult(list3, { ...a2, id: "c1", status: "failed" });
    expect(updated).toHaveLength(2);
    expect(updated[0].status).toBe("failed");
    expect(updated[1].status).toBe("requested");
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

  it("settleReviseTarget は result がなければ元の相談を返す", () => {
    const c = createConsult("c1b", "revise", {});
    const out = settleReviseTarget(c, "title");
    expect(out).toBe(c);
  });

  it("settleReviseTarget は最後の対象を除くと null(相談終了)", () => {
    const only = resolveConsult(createConsult("c3", "revise", {}), {
      revise: { title: { from: "a", to: "b" } },
    });
    expect(settleReviseTarget(only, "title")).toBeNull();
  });

  it("applyReviseTarget は target と result が一致しなければ素通し", () => {
    const c = resolveConsult(createConsult("c4", "revise", {}), {
      revise: { title: { from: "a", to: "b" } },
    });
    const article = stubArticle();
    const out = applyReviseTarget(article, c, "body");
    expect(out).toBe(article);
  });

  it("applyReviseTarget は target フィールドが result にあっても target 指定がなければ素通し", () => {
    const c = resolveConsult(createConsult("c5", "revise", {}), {
      revise: { outline: { from: [], to: [{ heading: "新", summary: "" }] } },
    });
    const article = stubArticle();
    const out = applyReviseTarget(article, c, "title");
    expect(out).toBe(article);
  });

  it("applyReviseTarget は result がなければ素通し", () => {
    const c = createConsult("c6", "revise", {});
    const article = stubArticle();
    const out = applyReviseTarget(article, c, "title");
    expect(out).toBe(article);
  });
});

describe("consultEngine: sentence/advice", () => {
  it("settleSentenceFix は block を除き、残りがあれば presenting", () => {
    const c = resolveConsult(createConsult("c1", "sentence", {}), {
      sentence: [
        { block: 0, from: "A", to: "A 改", sentence: "改" },
        { block: 2, from: "B", to: "B 改", sentence: "改" },
      ],
    });
    const out = settleSentenceFix(c, 0);
    expect(out?.result?.sentence?.map((f) => f.block)).toEqual([2]);
  });

  it("settleSentenceFix は最後の fix を除くと null", () => {
    const c = resolveConsult(createConsult("c1", "sentence", {}), {
      sentence: [{ block: 0, from: "A", to: "A 改", sentence: "改" }],
    });
    expect(settleSentenceFix(c, 0)).toBeNull();
  });

  it("settleSentenceFix は result がなければ元の相談を返す", () => {
    const c = createConsult("c1", "sentence", {});
    const out = settleSentenceFix(c, 0);
    expect(out).toBe(c);
  });

  it("adoptAdviceFix は提案を proto-changed 段落として本文末尾に足す", () => {
    const c = resolveConsult(createConsult("c1", "overall", {}), {
      overall: { overall: 80, scores: [], strengths: [], fixes: [{ quote: "q", reason: "r", suggestion: "内部リンクを足す" }] },
    });
    const out = adoptAdviceFix(stubArticle({ bodyHtml: "<p>本文</p>" }), c, 0);
    expect(out.bodyHtml).toBe('<p>本文</p><p class="proto-changed">内部リンクを足す</p>');
  });

  it("adoptAdviceFix は fix がなければ元の article を返す", () => {
    const c = createConsult("c1", "overall", {});
    const article = stubArticle({ bodyHtml: "<p>元本文</p>" });
    const out = adoptAdviceFix(article, c, 0);
    expect(out).toBe(article);
  });
});
