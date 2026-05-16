import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEmailSubscription } from "./useEmailSubscription";

describe("useEmailSubscription", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("初期状態は idle で email は空", () => {
    const { result } = renderHook(() => useEmailSubscription());
    expect(result.current.status).toBe("idle");
    expect(result.current.email).toBe("");
    expect(result.current.isSubmitting).toBe(false);
  });

  it("setEmail で email を更新できる", () => {
    const { result } = renderHook(() => useEmailSubscription());

    act(() => {
      result.current.setEmail("test@example.com");
    });

    expect(result.current.email).toBe("test@example.com");
  });

  it("submit 成功時に status が success になる", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useEmailSubscription());

    act(() => {
      result.current.setEmail("test@example.com");
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(result.current.status).toBe("success");
  });

  it("submit 失敗時 (response.ok=false) に status が error になる", async () => {
    fetchMock.mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useEmailSubscription());

    act(() => {
      result.current.setEmail("test@example.com");
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.status).toBe("error");
  });

  it("fetch が throw した場合に status が error になる", async () => {
    fetchMock.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useEmailSubscription());

    act(() => {
      result.current.setEmail("test@example.com");
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.status).toBe("error");
  });

  it("email が空のときは fetch を呼ばない", async () => {
    const { result } = renderHook(() => useEmailSubscription());

    await act(async () => {
      await result.current.submit();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("submitting 中は再度の submit を無視する", async () => {
    let resolveFetch: ((value: { ok: boolean }) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { result } = renderHook(() => useEmailSubscription());

    act(() => {
      result.current.setEmail("test@example.com");
    });

    act(() => {
      void result.current.submit();
    });

    await waitFor(() => expect(result.current.isSubmitting).toBe(true));

    act(() => {
      void result.current.submit();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch?.({ ok: true });
    });

    await waitFor(() => expect(result.current.status).toBe("success"));
  });
});
