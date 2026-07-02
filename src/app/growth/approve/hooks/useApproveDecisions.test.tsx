/**
 * useApproveDecisions の失敗時トースト可視化(#213)を網羅するテスト。
 *
 * 対象分岐:
 *  - decide(承認)失敗時に onError がエラーメッセージ付きで呼ばれること
 *  - undo(取消)失敗時に onError がエラーメッセージ付きで呼ばれること
 *  - いずれも failures[id] を設定する既存挙動が保たれること(加算・非破壊)
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
  it("承認(decide)失敗で onError がエラーメッセージ付きで呼ばれ、failures も設定される", async () => {
    postDecisionMock.mockRejectedValue(new Error("保存NG"));
    const onError = vi.fn();
    const { result } = renderDecisions(onError);

    await act(async () => {
      await result.current.decide(ITEM, "承認");
    });

    expect(onError).toHaveBeenCalledWith("保存NG");
    expect(result.current.failures[ITEM.id]?.message).toBe("保存NG");
  });

  it("取消(undo)失敗で onError がエラーメッセージ付きで呼ばれ、failures も設定される", async () => {
    postDecisionMock.mockRejectedValue(new Error("取消NG"));
    const onError = vi.fn();
    const { result } = renderDecisions(onError);

    await act(async () => {
      await result.current.undo(ITEM);
    });

    expect(onError).toHaveBeenCalledWith("取消NG");
    expect(result.current.failures[ITEM.id]?.message).toBe("取消NG");
  });
});
