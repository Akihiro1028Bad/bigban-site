/**
 * useBodyCommentConsult(#182: 本文行コメント入力結線)の pageId 跨ぎ持ち越し防止を
 * renderHook で固定するテスト。
 *
 * このフックは vitest.config.ts の coverage.exclude 対象(薄い fetch/DOM 結線)だが、
 * exclude はカバレッジ計測の除外であってテスト禁止ではない。F1 修正(記事切替で
 * comments/openFor/draft を初期化し別記事への誤送信を防ぐ)の挙動を固定する。
 *
 * fetch は本テストでは使わない(post 系は別途 InlineCommentReview 経由で検証済み)。
 * ここでは pageId 変化時の state リセットのみを対象にする。
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BodyCommentView } from "@/lib/growth/bodyComment";
import { useBodyCommentConsult } from "./useBodyCommentConsult";

// 1文=1行(コメント可)になる最小の本文。extractReviewLines の解析結果に依存しない
// 入力状態(comments/openFor/draft)だけを検証するため、key は任意の文字列で足りる。
const BODY = "<p>ここは重要です。</p>";
const KEY = "0::ここは重要です。";
const TOKEN = "secret-token";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

function mockFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function setup(pageId: string) {
  const onChanged = vi.fn();
  return renderHook(
    ({ pageId }: { pageId: string }) =>
      useBodyCommentConsult({ pageId, token: TOKEN, bodyHtml: BODY, onChanged }),
    { initialProps: { pageId } },
  );
}

const PROPOSAL: BodyCommentView = {
  status: "提示中",
  comments: [
    { blockIndex: 0, excerpt: "ここは重要です。", comment: "具体的にする" },
    { blockIndex: 0, excerpt: "ここは重要です。", comment: "短くする" },
  ],
  raw: "",
  proposal: [
    { commentIndex: 0, before: "<p>ここは重要です。</p>", after: "<p>ここが肝心です。</p>" },
    { commentIndex: 1, before: "<p>ここが肝心です。</p>", after: "<p>ここは大切です。</p>" },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("useBodyCommentConsult: pageId 変化での state リセット(記事跨ぎ持ち越し防止)", () => {
  it("pageId が変わると comments / openFor / draft が初期化される(別記事への誤送信を防ぐ)", () => {
    const view = setup("page-A");

    // 記事Aで行コメントを1件追加し、別の行の入力欄を開いて下書きを打ちかけの状態にする。
    act(() => view.result.current.openComposer(KEY));
    act(() => view.result.current.setDraft("記事Aのコメント"));
    act(() => view.result.current.addComment(KEY));
    act(() => view.result.current.openComposer("1::別の行"));
    act(() => view.result.current.setDraft("打ちかけの下書き"));

    expect(view.result.current.comments[KEY]).toEqual(["記事Aのコメント"]);
    expect(view.result.current.openFor).toBe("1::別の行");
    expect(view.result.current.draft).toBe("打ちかけの下書き");

    // 記事Bへ切替 → 溜めたコメント・開いている入力欄・下書きがすべて消える。
    view.rerender({ pageId: "page-B" });
    expect(view.result.current.comments).toEqual({});
    expect(view.result.current.openFor).toBeNull();
    expect(view.result.current.draft).toBe("");
  });

  it("同じ pageId の再レンダーでは入力状態を持ち越す(不要なリセットを起こさない)", () => {
    const view = setup("page-A");
    act(() => view.result.current.openComposer(KEY));
    act(() => view.result.current.setDraft("保持される下書き"));

    view.rerender({ pageId: "page-A" });
    expect(view.result.current.openFor).toBe(KEY);
    expect(view.result.current.draft).toBe("保持される下書き");
  });
});

describe("useBodyCommentConsult: overall body comment", () => {
  it("requestOverall が overall だけを送信し、成功後に下書きをクリアして再取得を依頼する", async () => {
    const onChanged = vi.fn();
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const view = renderHook(() =>
      useBodyCommentConsult({
        pageId: "page-A",
        token: TOKEN,
        bodyHtml: BODY,
        onChanged,
      })
    );

    act(() => view.result.current.setOverallDraft(" 全体にヘッジ "));
    await act(async () => {
      await view.result.current.requestOverall();
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/body-comment");
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toEqual({ pageId: "page-A", overall: "全体にヘッジ" });
    expect(body).not.toHaveProperty("comments");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(view.result.current.overallDraft).toBe("");
  });

  it("requestOverall は空文字なら no-op にする", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const view = setup("page-A");

    await act(async () => {
      await view.result.current.requestOverall();
    });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("pageId が変わると overallDraft も初期化される", () => {
    const view = setup("page-A");
    act(() => view.result.current.setOverallDraft("記事Aの全体コメント"));

    view.rerender({ pageId: "page-B" });

    expect(view.result.current.overallDraft).toBe("");
  });

  it("requestAi は行コメントだけを送信し overall を含めない", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }));
    const view = setup("page-A");

    act(() => view.result.current.openComposer(KEY));
    act(() => view.result.current.setDraft("この行を強くする"));
    act(() => view.result.current.addComment(KEY));
    act(() => view.result.current.setOverallDraft("全体コメントは別送信"));
    await act(async () => {
      await view.result.current.requestAi();
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/body-comment");
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toEqual({
      pageId: "page-A",
      comments: [{ blockIndex: 0, excerpt: "ここは重要です。", comment: "この行を強くする" }],
    });
    expect(body).not.toHaveProperty("overall");
  });
});

describe("useBodyCommentConsult: applyNow", () => {
  it("proposal は初期状態で全選択、toggleSelect で選択を切り替える", () => {
    const view = renderHook(() =>
      useBodyCommentConsult({ pageId: "page-A", token: TOKEN, bodyHtml: BODY, bodyComment: PROPOSAL, onChanged: vi.fn() }),
    );

    expect([...view.result.current.selected]).toEqual([0, 1]);
    act(() => view.result.current.toggleSelect(1));
    expect([...view.result.current.selected]).toEqual([0]);
    act(() => view.result.current.toggleSelect(1));
    expect([...view.result.current.selected]).toEqual([0, 1]);
  });

  it("pageId または proposal が変わると全選択へ戻す", () => {
    const view = renderHook(
      ({ pageId, bodyComment }: { pageId: string; bodyComment: BodyCommentView }) =>
        useBodyCommentConsult({ pageId, token: TOKEN, bodyHtml: BODY, bodyComment, onChanged: vi.fn() }),
      { initialProps: { pageId: "page-A", bodyComment: PROPOSAL } },
    );

    act(() => view.result.current.toggleSelect(1));
    view.rerender({ pageId: "page-B", bodyComment: PROPOSAL });
    expect([...view.result.current.selected]).toEqual([0, 1]);
    act(() => view.result.current.toggleSelect(1));
    view.rerender({
      pageId: "page-B",
      bodyComment: { ...PROPOSAL, proposal: [PROPOSAL.proposal[0]] },
    });
    expect([...view.result.current.selected]).toEqual([0]);
  });

  it("同じ commentIndex の提示内容が更新された場合も全選択へ戻す", () => {
    const view = renderHook(
      ({ bodyComment }: { bodyComment: BodyCommentView }) =>
        useBodyCommentConsult({ pageId: "page-A", token: TOKEN, bodyHtml: BODY, bodyComment, onChanged: vi.fn() }),
      { initialProps: { bodyComment: PROPOSAL } },
    );

    act(() => view.result.current.toggleSelect(1));
    view.rerender({
      bodyComment: {
        ...PROPOSAL,
        proposal: PROPOSAL.proposal.map((item) =>
          item.commentIndex === 1 ? { ...item, after: "<p>更新された案です。</p>" } : item,
        ),
      },
    });

    expect([...view.result.current.selected]).toEqual([0, 1]);
  });

  it("選択分だけを保存し、非選択分を学習ログへ却下として送る", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ success: true }),
      jsonResponse({ success: true }),
      jsonResponse({ success: true }),
    );
    const view = renderHook(() =>
      useBodyCommentConsult({ pageId: "page-A", token: TOKEN, bodyHtml: BODY, bodyComment: PROPOSAL, onChanged: vi.fn() }),
    );
    act(() => view.result.current.toggleSelect(1));

    await act(async () => {
      await view.result.current.applyNow();
    });

    const saveBody = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(saveBody.bodyHtml).toContain("ここが肝心です。");
    expect(saveBody.bodyHtml).not.toContain("ここは大切です。");
    expect(saveBody.adoptedFixes).toHaveLength(1);
    expect(fetchFn.mock.calls[2][0]).toBe("/api/growth/learning-log/reject");
    expect(JSON.parse((fetchFn.mock.calls[2][1] as RequestInit).body as string)).toEqual({
      pageId: "page-A",
      source: "comment-revise",
      rejectedFixes: [
        {
          aspect: "インラインコメント",
          detail: "コメント: 短くする（対象: ここは重要です。）",
          before: "<p>ここが肝心です。</p>",
          after: "<p>ここは大切です。</p>",
        },
      ],
    });
  });

  it("非選択がない場合は却下 API を呼ばず、却下失敗でも反映は成功扱い", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const allSelected = renderHook(() =>
      useBodyCommentConsult({ pageId: "page-A", token: TOKEN, bodyHtml: BODY, bodyComment: PROPOSAL, onChanged: vi.fn() }),
    );
    await act(async () => {
      await allSelected.result.current.applyNow();
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const rejecting = mockFetch(
      jsonResponse({ success: true }),
      jsonResponse({ success: true }),
      jsonResponse({ success: false }, false),
    );
    const view = renderHook(() =>
      useBodyCommentConsult({ pageId: "page-A", token: TOKEN, bodyHtml: BODY, bodyComment: PROPOSAL, onChanged: vi.fn() }),
    );
    act(() => view.result.current.toggleSelect(1));
    await act(async () => {
      await view.result.current.applyNow();
    });
    expect(rejecting).toHaveBeenCalledTimes(3);
    expect(view.result.current.error).toBe("");
  });

  it("却下 API のネットワーク例外も反映の成功状態へ影響させない", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockRejectedValueOnce(new Error("network"));
    vi.stubGlobal("fetch", fetchFn);
    const view = renderHook(() =>
      useBodyCommentConsult({ pageId: "page-A", token: TOKEN, bodyHtml: BODY, bodyComment: PROPOSAL, onChanged: vi.fn() }),
    );
    act(() => view.result.current.toggleSelect(1));

    await act(async () => {
      await view.result.current.applyNow();
    });

    expect(view.result.current.error).toBe("");
  });

  it("dismissAll は dismiss 成功後に全件を却下送信し、却下失敗は操作結果へ影響させない", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: false }, false));
    const view = renderHook(() =>
      useBodyCommentConsult({ pageId: "page-A", token: TOKEN, bodyHtml: BODY, bodyComment: PROPOSAL, onChanged: vi.fn() }),
    );

    await act(async () => {
      await view.result.current.dismissAll();
    });

    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/body-comment/dismiss");
    expect(fetchFn.mock.calls[1][0]).toBe("/api/growth/learning-log/reject");
    expect(JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string).rejectedFixes).toHaveLength(2);
    expect(view.result.current.error).toBe("");
  });

  it("dismissAll は dismiss 失敗時に却下ログを送らない", async () => {
    const fetchFn = mockFetch(jsonResponse({ success: false }, false, 500));
    const view = renderHook(() =>
      useBodyCommentConsult({ pageId: "page-A", token: TOKEN, bodyHtml: BODY, bodyComment: PROPOSAL, onChanged: vi.fn() }),
    );

    await act(async () => {
      await view.result.current.dismissAll();
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/body-comment/dismiss");
    expect(view.result.current.error).toBe("取り消しに失敗しました。");
  });

  it("dismissAll は21件以上の却下案を20件ずつ分割して送る", async () => {
    const manyProposal: BodyCommentView = {
      ...PROPOSAL,
      comments: Array.from({ length: 21 }, (_, index) => ({
        blockIndex: index,
        excerpt: `対象${index}`,
        comment: `コメント${index}`,
      })),
      proposal: Array.from({ length: 21 }, (_, index) => ({
        commentIndex: index,
        before: `<p>前${index}</p>`,
        after: `<p>後${index}</p>`,
      })),
    };
    const fetchFn = mockFetch(
      jsonResponse({ success: true }),
      jsonResponse({ success: true }),
      jsonResponse({ success: true }),
    );
    const view = renderHook(() =>
      useBodyCommentConsult({ pageId: "page-A", token: TOKEN, bodyHtml: BODY, bodyComment: manyProposal, onChanged: vi.fn() }),
    );

    await act(async () => {
      await view.result.current.dismissAll();
    });

    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      "/api/growth/body-comment/dismiss",
      "/api/growth/learning-log/reject",
      "/api/growth/learning-log/reject",
    ]);
    expect(JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string).rejectedFixes).toHaveLength(20);
    expect(JSON.parse((fetchFn.mock.calls[2][1] as RequestInit).body as string).rejectedFixes).toHaveLength(1);
  });

  it("保存 POST に comment-revise source と固定の採用観点を含める", async () => {
    const bodyComment: BodyCommentView = {
      status: "提示中",
      comments: [],
      raw: "",
      proposal: [
        {
          commentIndex: 0,
          before: "<p>ここは重要です。</p>",
          after: "<p>ここが肝心です。</p>",
        },
      ],
    };
    const onChanged = vi.fn();
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const view = renderHook(() =>
      useBodyCommentConsult({
        pageId: "page-A",
        token: TOKEN,
        bodyHtml: BODY,
        bodyComment,
        onChanged,
      })
    );

    await act(async () => {
      await view.result.current.applyNow();
    });

    expect(fetchFn.mock.calls[0][0]).toBe("/api/growth/draft/edit");
    const saveBody = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(saveBody.bodyHtml).toContain("ここが肝心です。");
    expect(saveBody.source).toBe("comment-revise");
    expect(saveBody.adoptedAspects).toEqual(["インラインコメント"]);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("adoptedFixes: コメント本文・対象・変更前後を送る", async () => {
    const bodyComment: BodyCommentView = {
      status: "提示中",
      comments: [
        { blockIndex: 0, excerpt: "ここは重要です。", comment: "もっと具体的に" },
      ],
      raw: "",
      proposal: [
        {
          commentIndex: 0,
          before: "<p>ここは重要です。</p>",
          after: "<p>ここが肝心です。</p>",
        },
      ],
    };
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const view = renderHook(() =>
      useBodyCommentConsult({
        pageId: "page-A",
        token: TOKEN,
        bodyHtml: BODY,
        bodyComment,
        onChanged: vi.fn(),
      })
    );

    await act(async () => {
      await view.result.current.applyNow();
    });

    const saveBody = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(saveBody.adoptedFixes).toEqual([
      {
        aspect: "インラインコメント",
        detail: "コメント: もっと具体的に（対象: ここは重要です。）",
        before: "<p>ここは重要です。</p>",
        after: "<p>ここが肝心です。</p>",
      },
    ]);
  });

  it("adoptedFixes: コメント/proposal が欠落しても空文字でフォールバックする", async () => {
    const bodyComment: BodyCommentView = {
      status: "提示中",
      comments: [], // commentIndex に対応するコメントが無い
      raw: "",
      proposal: [
        { commentIndex: 0, before: "<p>ここは重要です。</p>", after: "<p>ここが肝心です。</p>" },
      ],
    };
    const fetchFn = mockFetch(jsonResponse({ success: true }), jsonResponse({ success: true }));
    const view = renderHook(() =>
      useBodyCommentConsult({
        pageId: "page-A",
        token: TOKEN,
        bodyHtml: BODY,
        bodyComment,
        onChanged: vi.fn(),
      })
    );

    await act(async () => {
      await view.result.current.applyNow();
    });

    const saveBody = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(saveBody.adoptedFixes).toEqual([
      {
        aspect: "インラインコメント",
        detail: "コメント: （対象: ）",
        before: "<p>ここは重要です。</p>",
        after: "<p>ここが肝心です。</p>",
      },
    ]);
  });
});
