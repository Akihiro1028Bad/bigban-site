// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { fetchDraftKey } from "./draft-meta";
import type { FetchFn } from "./http";

describe("fetchDraftKey", () => {
  it("管理APIのコンテンツメタ単体取得に X-MICROCMS-API-KEY 付きで GET し draftKey を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "abc123", status: ["DRAFT"], draftKey: "dk-xyz" }),
      text: async () => "",
    });

    const key = await fetchDraftKey("news", "abc123", {
      serviceDomain: "thepicklebang",
      apiKey: "mgmt-key",
      fetchFn,
    });

    expect(key).toBe("dk-xyz");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://thepicklebang.microcms-management.io/api/v1/contents/news/abc123"
    );
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-MICROCMS-API-KEY"]).toBe(
      "mgmt-key"
    );
  });

  it("draftKey が null(公開済み等)のときは null を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "abc123", status: ["PUBLISH"], draftKey: null }),
      text: async () => "",
    });

    const key = await fetchDraftKey("news", "abc123", {
      serviceDomain: "thepicklebang",
      apiKey: "mgmt-key",
      fetchFn,
    });
    expect(key).toBeNull();
  });

  it("draftKey フィールドが無いときも null を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "abc123" }),
      text: async () => "",
    });

    const key = await fetchDraftKey("news", "abc123", {
      serviceDomain: "thepicklebang",
      apiKey: "mgmt-key",
      fetchFn,
    });
    expect(key).toBeNull();
  });

  it("HTTP エラー時は内容付きで例外を投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "not found",
    });

    await expect(
      fetchDraftKey("news", "missing", {
        serviceDomain: "thepicklebang",
        apiKey: "mgmt-key",
        fetchFn,
      })
    ).rejects.toThrow("404");
  });
});
