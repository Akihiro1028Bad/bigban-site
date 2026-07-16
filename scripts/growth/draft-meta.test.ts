// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { fetchContentSlug, fetchContentSummary, fetchDraftKey } from "./draft-meta";
import { ExternalApiError } from "./externalApiError";
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

  it("HTTP エラー時は本文を含めず構造化例外を投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "not found",
    });

    const promise = fetchDraftKey("news", "missing", {
      serviceDomain: "thepicklebang",
      apiKey: "mgmt-key",
      fetchFn,
    });

    await expect(promise).rejects.toBeInstanceOf(ExternalApiError);
    await expect(promise).rejects.toMatchObject({
      operation: "microcms.draft-key.get",
      status: 404,
    });
    await expect(promise).rejects.not.toThrow(/not found/);
  });
});

describe("fetchContentSlug", () => {
  it("下書きの元slugをdraftKey付きで取得する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ slug: "Pickleball Skill_Roadmap!" }),
      text: async () => "",
    });

    const slug = await fetchContentSlug("news", "stable-content-id", "dk-old", {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });

    expect(slug).toBe("Pickleball Skill_Roadmap!");
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://thepicklebang.microcms.io/api/v1/news/stable-content-id?fields=slug&draftKey=dk-old"
    );
  });

  it.each([{}, { slug: "" }])("slugが空または欠落していれば安全側で止める", async (json) => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => json,
      text: async () => "",
    });

    await expect(
      fetchContentSlug("news", "stable-content-id", "dk-old", {
        serviceDomain: "thepicklebang",
        apiKey: "key",
        fetchFn,
      })
    ).rejects.toThrow(/slug/);
  });

  it("HTTPエラーは本文を含めず構造化例外にする", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "not found",
    });

    const promise = fetchContentSlug("news", "missing", "dk-old", {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });

    await expect(promise).rejects.toMatchObject({
      operation: "microcms.content.slug.get",
      status: 404,
    });
    await expect(promise).rejects.not.toThrow(/not found/);
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

  it("HTTPエラーは本文を含めず構造化例外にする", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => "private response\nsecond line",
    });

    const error = await fetchContentSummary("news", "abc123", null, {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({
      operation: "microcms.content.summary.get",
      status: 503,
    });
    expect((error as Error).message).not.toContain("private response");
    expect((error as Error).message).not.toContain("second line");
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

  it("HTTPS でない eyecatch URL は null にする(javascript:/http: 等を弾く)", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: "t", eyecatch: { url: "javascript:alert(1)" } }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("news", "id", null, {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary.eyecatchUrl).toBeNull();
  });

  it("category が relation オブジェクト(columns)なら name を文字列で取り出す(Bug2)", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        title: "コラム記事",
        category: { id: "start", name: "はじめる", nameEn: "Start" },
      }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("columns", "id", "dk", {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary.category).toBe("はじめる");
  });

  it("category が relation オブジェクトの配列(columns)なら先頭の name を取り出す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        title: "t",
        category: [{ id: "compare", name: "くらべる" }],
      }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("columns", "id", "dk", {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary.category).toBe("くらべる");
  });

  it("relation に name が無く nameEn だけなら nameEn を使う", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: "t", category: { id: "x", nameEn: "Start" } }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("columns", "id", "dk", {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary.category).toBe("Start");
  });

  it("relation に表示名が無い(id のみ)ときは category を null にする(空/[object Object]を出さない)", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: "t", category: { id: "x" } }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("columns", "id", "dk", {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary.category).toBeNull();
  });

  it("category が空白のみの文字列(news select)なら null(空バッジを出さない)", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: "t", category: "   " }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("news", "id", null, {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary.category).toBeNull();
  });

  it("category が想定外の型(数値など)なら null にする(防御)", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: "t", category: 42 }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("columns", "id", "dk", {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary.category).toBeNull();
  });

  it("category が relation オブジェクトの空配列なら null", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: "t", category: [] }),
      text: async () => "",
    });

    const summary = await fetchContentSummary("columns", "id", "dk", {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    });
    expect(summary.category).toBeNull();
  });

  it("HTTP エラー時は本文を例外へ含めない", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "boom".repeat(100),
    });

    const error = await fetchContentSummary("news", "id", "dk", {
      serviceDomain: "thepicklebang",
      apiKey: "key",
      fetchFn,
    }).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ operation: "microcms.content.summary.get", status: 500 });
    expect((error as Error).message).not.toContain("boom");
  });
});
