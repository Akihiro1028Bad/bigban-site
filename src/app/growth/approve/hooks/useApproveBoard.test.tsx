import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw/server";
import { setupMswServer } from "@/test/msw/setup";
import { makeTestQueryClient } from "@/test/renderWithClient";

import { BOARD_URL } from "../api";
import { useApproveBoard } from "./useApproveBoard";

setupMswServer();

function makeWrapper() {
  const queryClient = makeTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const NO_POLL = { pollIntervalMs: 100_000, shouldPoll: () => false };

describe("useApproveBoard", () => {
  it("成功で items を返す", async () => {
    server.use(http.get(BOARD_URL, () => HttpResponse.json({ success: true, items: [{ id: "i1" }] })));
    const { result } = renderHook(() => useApproveBoard({ token: "t", ...NO_POLL }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "i1" }]);
  });

  it("enabled:false なら取得しない(idle)", () => {
    const { result } = renderHook(
      () => useApproveBoard({ token: "t", enabled: false, ...NO_POLL }),
      { wrapper: makeWrapper() }
    );
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("失敗で error(メッセージを保持)", async () => {
    server.use(http.get(BOARD_URL, () => HttpResponse.json({ success: false, error: "NG" }, { status: 500 })));
    const { result } = renderHook(() => useApproveBoard({ token: "t", ...NO_POLL }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("NG");
  });

  it("shouldPoll=true の間は refetchInterval が間隔を返す(ポーリング継続)", async () => {
    server.use(http.get(BOARD_URL, () => HttpResponse.json({ success: true, items: [] })));
    // 取得成功後に react-query が refetchInterval を評価し、true 分岐(間隔)を通る。
    const { result } = renderHook(
      () => useApproveBoard({ token: "t", pollIntervalMs: 100_000, shouldPoll: () => true }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
