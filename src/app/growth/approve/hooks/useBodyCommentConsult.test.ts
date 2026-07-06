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

describe("useBodyCommentConsult: applyNow", () => {
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
