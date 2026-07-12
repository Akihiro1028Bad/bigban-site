// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";

import { postJson, defaultFetch, type FetchFn } from "./http";

describe("postJson", () => {
  it("Bearer トークンと JSON ボディで POST し、json を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: 1 }),
      text: async () => "",
    });

    const result = await postJson(
      "https://example.com/api",
      "ya29.token",
      { q: 1 },
      fetchFn
    );

    expect(result).toEqual({ ok: 1 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://example.com/api");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer ya29.token"
    );
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
    expect(init.body).toBe(JSON.stringify({ q: 1 }));
  });

  it("ok でない場合は status とレスポンス本文を含むエラーを投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => "permission denied",
    });

    await expect(
      postJson("https://example.com/api", "t", {}, fetchFn)
    ).rejects.toThrow(/403.*permission denied/);
  });
});

describe("defaultFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("グローバル fetch に委譲する", async () => {
    const globalFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", globalFetch);

    await defaultFetch("https://example.com", { method: "GET" });

    expect(globalFetch).toHaveBeenCalledWith("https://example.com", {
      method: "GET",
    });
  });
});
