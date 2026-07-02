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
import { describe, expect, it, vi } from "vitest";

import { useBodyCommentConsult } from "./useBodyCommentConsult";

// 1文=1行(コメント可)になる最小の本文。extractReviewLines の解析結果に依存しない
// 入力状態(comments/openFor/draft)だけを検証するため、key は任意の文字列で足りる。
const BODY = "<p>ここは重要です。</p>";
const KEY = "0::ここは重要です。";
const TOKEN = "secret-token";

function setup(pageId: string) {
  const onChanged = vi.fn();
  return renderHook(
    ({ pageId }: { pageId: string }) =>
      useBodyCommentConsult({ pageId, token: TOKEN, bodyHtml: BODY, onChanged }),
    { initialProps: { pageId } },
  );
}

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
