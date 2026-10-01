import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { act, renderHook } from "@testing-library/react";
import { useMountedNow } from "./useMountedNow";

function Probe() {
  const now = useMountedNow();
  return <p>{now === null ? "server" : "client"}</p>;
}

describe("useMountedNow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("サーバー描画では null を返す(日付をキャッシュされたページに焼き込まない)", () => {
    expect(renderToString(<Probe />)).toContain("server");
  });

  it("クライアントでは現在時刻の Date を返す", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T03:00:30Z"));
    const { result } = renderHook(() => useMountedNow());
    expect(result.current).toBeInstanceOf(Date);
    // 1分単位に丸めるため、同じ分の間は同じ値を返す。
    expect(result.current?.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });

  it("タブに戻ったとき(visibilitychange)に現在時刻へ更新する", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
    const { result } = renderHook(() => useMountedNow());
    expect(result.current?.toISOString()).toBe("2026-10-01T03:00:00.000Z");

    // 開きっぱなしのタブで日をまたいだあと、タブに戻ってきた状況。
    vi.setSystemTime(new Date("2026-10-02T03:00:00Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current?.toISOString()).toBe("2026-10-02T03:00:00.000Z");
  });

  it("アンマウント後は visibilitychange を購読しない", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useMountedNow());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    removeSpy.mockRestore();
  });
});
