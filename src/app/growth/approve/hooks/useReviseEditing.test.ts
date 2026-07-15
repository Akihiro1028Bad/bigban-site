/**
 * useReviseEditing の構成案 AI 修正依頼を renderHook で固定する。
 * useMutation を含むため QueryClientProvider で包み、API は postRevise をモックする。
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PendingItem } from "../types";
import { postRevise, postReviseApply } from "../api";

import { useReviseEditing } from "./useReviseEditing";

vi.mock("../api", () => ({
  fetchBoard: vi.fn().mockResolvedValue([]),
  postRevise: vi.fn().mockResolvedValue(undefined),
  postReviseApply: vi.fn().mockResolvedValue(undefined),
  postReviseEdit: vi.fn().mockResolvedValue(undefined),
}));

const mockedPostRevise = vi.mocked(postRevise);
const mockedPostReviseApply = vi.mocked(postReviseApply);

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

function setup(openId = BASE_ITEM.id, token = "token-1") {
  const setBoardData = vi.fn();
  const view = renderHook(
    ({ currentOpenId }: { currentOpenId: string | null }) =>
      useReviseEditing({ token, openId: currentOpenId, setBoardData }),
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

describe("retryRevise", () => {
  it("Notionに保存された構成案コメントとタイトル指示を同じ内容で再送する", async () => {
    const { view } = setup();
    const storedComments = [{ line: "記事全体", comment: "章立てを整理" }];
    const item: PendingItem = {
      ...BASE_ITEM,
      reviseStatus: "失敗",
      reviseInstructions: JSON.stringify(storedComments),
      reviseTitleInstruction: "探し方を主題にする",
    };

    await act(async () => {
      await view.result.current.retryRevise(item);
    });

    expect(mockedPostRevise).toHaveBeenCalledWith("token-1", {
      pageId: BASE_ITEM.id,
      comments: storedComments,
      titleInstruction: "探し方を主題にする",
    });
  });

  it("保存済み指示が空ならPOSTせず明示エラーにする", async () => {
    const { view } = setup();

    await act(async () => {
      await view.result.current.retryRevise({ ...BASE_ITEM, reviseStatus: "失敗" });
    });

    expect(mockedPostRevise).not.toHaveBeenCalled();
    expect(view.result.current.reviseError).toBe("再依頼できる修正指示がありません。");
  });

  it("保存済みコメントJSONが壊れていればPOSTせず明示エラーにする", async () => {
    const { view } = setup();

    await act(async () => {
      await view.result.current.retryRevise({
        ...BASE_ITEM,
        reviseStatus: "失敗",
        reviseInstructions: "{壊れ",
      });
    });

    expect(mockedPostRevise).not.toHaveBeenCalled();
    expect(view.result.current.reviseError).toBe("保存済みの修正指示を読み取れません。新しい指示を入力してください。");
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

describe("applyRevise", () => {
  it("却下した修正を共通の認証ヘッダーで学習ログへ送る", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);
    const { view } = setup(BASE_ITEM.id, "認証トークン");

    await act(async () => {
      await view.result.current.applyRevise(BASE_ITEM, "discard", [
        { aspect: "構成案修正", detail: "見出し", before: "前", after: "後" },
      ]);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/growth/learning-log/reject", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Growth-Request": "1",
      },
      body: JSON.stringify({
        pageId: BASE_ITEM.id,
        source: "revise-discard",
        rejectedFixes: [{ aspect: "構成案修正", detail: "見出し", before: "前", after: "後" }],
      }),
    });
  });

  it("却下理由なしで破棄すると学習ログを送らない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { view } = setup();

    await act(async () => {
      await view.result.current.applyRevise(BASE_ITEM, "discard");
    });

    expect(mockedPostReviseApply).toHaveBeenCalledWith("token-1", BASE_ITEM.id, "discard", undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
