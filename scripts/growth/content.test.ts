// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { createDraft, patchDraft, type ContentApiOptions } from "./content";
import type { FetchFn } from "./http";

function opts(fetchFn: FetchFn): ContentApiOptions {
  return { serviceDomain: "thepicklebang", apiKey: "write-key", fetchFn };
}

describe("createDraft", () => {
  it("status=draft で POST し、作成された id を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "abc123" }),
      text: async () => "",
    });

    const id = await createDraft("news", { title: "T" }, opts(fetchFn));

    expect(id).toBe("abc123");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://thepicklebang.microcms.io/api/v1/news?status=draft");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-MICROCMS-API-KEY"]).toBe(
      "write-key"
    );
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
    expect(init.body).toBe(JSON.stringify({ title: "T" }));
  });

  it("API エラー時は status を含むエラーを投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "invalid api key",
    });
    await expect(
      createDraft("news", { title: "T" }, opts(fetchFn))
    ).rejects.toThrow(/401/);
  });

  it("応答に id が無い場合はエラーを投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({}),
      text: async () => "",
    });
    await expect(
      createDraft("news", { title: "T" }, opts(fetchFn))
    ).rejects.toThrow(/id/);
  });
});

describe("patchDraft", () => {
  it("contentId 指定で status=draft の PATCH を送る", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "abc123" }),
      text: async () => "",
    });

    const id = await patchDraft(
      "news",
      "abc123",
      { eyecatch: "https://img" },
      opts(fetchFn)
    );

    expect(id).toBe("abc123");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://thepicklebang.microcms.io/api/v1/news/abc123?status=draft"
    );
    expect(init.method).toBe("PATCH");
  });
});
