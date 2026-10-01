import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { renderHook } from "@testing-library/react";
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
});
