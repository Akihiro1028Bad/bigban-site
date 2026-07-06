/**
 * useReviseEditing の構成案 AI 修正依頼を renderHook で固定する。
 * useMutation を含むため QueryClientProvider で包み、API は postRevise をモックする。
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PendingItem } from "../types";
import { postRevise } from "../api";

import { useReviseEditing } from "./useReviseEditing";

vi.mock("../api", () => ({
  fetchBoard: vi.fn().mockResolvedValue([]),
  postRevise: vi.fn().mockResolvedValue(undefined),
  postReviseApply: vi.fn().mockResolvedValue(undefined),
  postReviseEdit: vi.fn().mockResolvedValue(undefined),
}));

const mockedPostRevise = vi.mocked(postRevise);

const BASE_ITEM: PendingItem = {
  id: "page-1",
  kind: "idea",
  title: "市川で屋内ピックルボールを始める",
  subtitle: "記事案",
  outline: "## 見出しA\n説明A\n## 見出しB\n説明B",
  reviseStatus: "なし",
  stage: "proposed",
};

function createWrapper(): ({ children }: { children: ReactNode }) => ReactNode {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function setup(openId = BASE_ITEM.id) {
  const setBoardData = vi.fn();
  const view = renderHook(
    ({ currentOpenId }: { currentOpenId: string | null }) =>
      useReviseEditing({ token: "token-1", openId: currentOpenId, setBoardData }),
    { initialProps: { currentOpenId: openId }, wrapper: createWrapper() }
  );
  return { setBoardData, view };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestRevise", () => {
  it("全体指示が非空なら記事全体の擬似コメント1件だけを送る", async () => {
    const { view } = setup();
    act(() => view.result.current.saveComment(0, "このセクションは短く"));
    act(() => view.result.current.setOutlineOverallPrompt("全体を直す"));

    await act(async () => {
      await view.result.current.requestRevise(BASE_ITEM);
    });

    expect(mockedPostRevise).toHaveBeenCalledWith("token-1", {
      pageId: BASE_ITEM.id,
      comments: [{ line: "記事全体", comment: "全体を直す" }],
    });
  });

  it("全体指示が空なら従来どおりセクションコメントを見出しへ展開する", async () => {
    const { view } = setup();
    act(() => view.result.current.saveComment(1, "順番を前に"));

    await act(async () => {
      await view.result.current.requestRevise(BASE_ITEM);
    });

    expect(mockedPostRevise).toHaveBeenCalledWith("token-1", {
      pageId: BASE_ITEM.id,
      comments: [{ line: "見出しB", comment: "順番を前に" }],
    });
  });

  it("全体指示のみでも依頼できる", async () => {
    const { view } = setup();
    act(() => view.result.current.setOutlineOverallPrompt("導入と結論を対応させる"));

    await act(async () => {
      await view.result.current.requestRevise(BASE_ITEM);
    });

    expect(mockedPostRevise).toHaveBeenCalledTimes(1);
  });

  it("成功時に全体指示をクリアする", async () => {
    const { view } = setup();
    act(() => view.result.current.setOutlineOverallPrompt("章立てを整理"));

    await act(async () => {
      await view.result.current.requestRevise(BASE_ITEM);
    });

    expect(view.result.current.outlineOverallPrompt).toBe("");
  });
});

describe("記事切り替えリセット", () => {
  it("openId が変わると全体指示をクリアする", async () => {
    const { view } = setup("page-1");
    act(() => view.result.current.setOutlineOverallPrompt("持ち越さない"));
    expect(view.result.current.outlineOverallPrompt).toBe("持ち越さない");

    view.rerender({ currentOpenId: "page-2" });

    await waitFor(() => expect(view.result.current.outlineOverallPrompt).toBe(""));
  });
});
