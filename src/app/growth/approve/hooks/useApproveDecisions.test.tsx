/**
 * useApproveDecisions の失敗時トースト可視化(#213)を網羅するテスト。
 *
 * 対象分岐:
 *  - decide(承認)失敗時に onError がエラーメッセージ付きで呼ばれること
 *  - undo(取消)失敗時に onError がエラーメッセージ付きで呼ばれること
 *  - #213: カードの失敗アラート撤去に伴い failures/savingId は撤去。失敗の可視化は onError のみ。
 *
 * postDecision は vi.mock で reject させ、fetch を介さず catch 分岐へ確実に入れる。
 * useMutation を含むため QueryClientProvider でラップする。
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeTestQueryClient } from "@/test/renderWithClient";

import { postDecision } from "../api";
import type { PendingItem } from "../types";
import { useApproveDecisions } from "./useApproveDecisions";

vi.mock("../api", () => ({
  postDecision: vi.fn(),
}));

const postDecisionMock = vi.mocked(postDecision);

function makeWrapper() {
  const queryClient = makeTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const ITEM: PendingItem = {
  id: "page-001",
  kind: "idea",
  title: "テスト記事",
  subtitle: "副題",
  stage: "proposed",
};

function renderDecisions(onError: (message: string) => void) {
  return renderHook(
    () =>
      useApproveDecisions({
        token: "t",
        onFocus: vi.fn(),
        onClosePanel: vi.fn(),
        onError,
      }),
    { wrapper: makeWrapper() }
  );
}

beforeEach(() => {
  postDecisionMock.mockReset();
});

describe("useApproveDecisions 失敗時トースト(#213)", () => {
  it("承認(decide)失敗で onError がエラーメッセージ付きで呼ばれる", async () => {
    postDecisionMock.mockRejectedValue(new Error("保存NG"));
    const onError = vi.fn();
    const { result } = renderDecisions(onError);

    await act(async () => {
      await result.current.decide(ITEM, "承認");
    });

    expect(onError).toHaveBeenCalledWith("保存NG");
    // 失敗しても decided は未確定のまま(行に決定チップは出ない)。
    expect(result.current.decided[ITEM.id]).toBeUndefined();
  });

  it("取消(undo)失敗で onError がエラーメッセージ付きで呼ばれる", async () => {
    postDecisionMock.mockRejectedValue(new Error("取消NG"));
    const onError = vi.fn();
    const { result } = renderDecisions(onError);

    await act(async () => {
      await result.current.undo(ITEM);
    });

    expect(onError).toHaveBeenCalledWith("取消NG");
  });

  it("施策の実行済みへの更新を保存済み選択として保持する", async () => {
    postDecisionMock.mockResolvedValue();
    const onError = vi.fn();
    const { result } = renderDecisions(onError);
    const item: PendingItem = { ...ITEM, kind: "proposal", stage: "completed" };

    await act(async () => {
      await result.current.decide(item, "実行済み");
    });

    expect(postDecisionMock).toHaveBeenCalledWith("t", item.id, "実行済み");
    expect(result.current.decided[item.id]).toBe("実行済み");
    expect(onError).not.toHaveBeenCalled();
  });
});
