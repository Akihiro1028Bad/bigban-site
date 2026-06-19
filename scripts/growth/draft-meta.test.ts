// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { fetchContentSummary, fetchDraftKey } from "./draft-meta";
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

  it("contentId をパスセグメントとして URL エンコードする(パスインジェクション防御)", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ draftKey: "dk" }),
      text: async () => "",
    });

    await fetchDraftKey("news", "../secret/evil", {
      serviceDomain: "thepicklebang",
      apiKey: "mgmt-key",
      fetchFn,
    });
    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://thepicklebang.microcms-management.io/api/v1/contents/news/..%2Fsecret%2Fevil"
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

describe("fetchContentSummary", () => {
  it("コンテンツAPIに draftKey + fields 付きで GET し、要約を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        title: "本八幡の屋内コート",
        excerpt: "雨でも続けられる",
        category: ["お知らせ"],
        eyecatch: { url: "https://img.example/cover.png", width: 1536, height: 1024 },
      }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("news", "abc123", "dk-xyz", {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });

    expect(summary).toEqual({
      title: "本八幡の屋内コート",
      excerpt: "雨でも続けられる",
      category: "お知らせ",
      eyecatchUrl: "https://img.example/cover.png",
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://thepicklebang.microcms.io/api/v1/news/abc123?fields=title%2Cexcerpt%2Ccategory%2Ceyecatch&draftKey=dk-xyz"
    );
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-MICROCMS-API-KEY"]).toBe("key");
  });

  it("draftKey が null なら draftKey クエリを付けない", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: "t" }),
      text: async () => "",
    });

    await fetchContentSummary("news", "abc123", null, {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    const [url] = fetchFn.mock.calls[0];
    expect(url).not.toContain("draftKey");
  });

  it("category が文字列(配列でない)でもそのまま使う", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: "t", category: "コラム" }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("news", "id", null, {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary.category).toBe("コラム");
  });

  it("欠けているフィールドは null にする", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    });

    const summary = await fetchContentSummary("news", "id", null, {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary).toEqual({
      title: null,
      excerpt: null,
      category: null,
      eyecatchUrl: null,
    });
  });

  it("category が空配列のときは null", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: "t", category: [], eyecatch: {} }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("news", "id", null, {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary.category).toBeNull();
    expect(summary.eyecatchUrl).toBeNull();
  });

  it("HTTP エラー時は内容付きで例外を投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "boom",
    });

    await expect(
      fetchContentSummary("news", "id", "dk", {
        serviceDomain: "thepicklebang",
        apiKey: "key",
        fetchFn,
      })
    ).rejects.toThrow(/500.*boom/);
  });
});
