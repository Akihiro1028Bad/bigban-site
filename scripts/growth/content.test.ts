// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import {
  createDraft,
  patchDraft,
  slugToContentId,
  MicrocmsHttpError,
  type ContentApiOptions,
} from "./content";
import type { FetchFn } from "./http";

function opts(fetchFn: FetchFn): ContentApiOptions {
  return { serviceDomain: "thepicklebang", apiKey: "write-key", fetchFn };
}

const PUT_URL =
  "https://thepicklebang.microcms.io/api/v1/news/my-slug?status=draft";

const okId = (id: string) =>
  ({
    ok: true,
    status: 201,
    json: async () => ({ id }),
    text: async () => "",
  }) as Awaited<ReturnType<FetchFn>>;

const conflict = () =>
  ({
    ok: false,
    status: 400,
    json: async () => ({}),
    text: async () =>
      '{"message":"Content is already exists. If you want update, please use PATCH request."}',
  }) as Awaited<ReturnType<FetchFn>>;

describe("slugToContentId", () => {
  it("有効なslugはそのまま使える", () => {
    expect(slugToContentId("racket-sports-to-pickleball-guide")).toBe(
      "racket-sports-to-pickleball-guide"
    );
  });

  it("大文字・空白・記号を正規化する", () => {
    expect(slugToContentId("Pickleball Skill_Roadmap!")).toBe(
      "pickleball-skill-roadmap"
    );
  });

  it("前後の連続ハイフンを畳む", () => {
    expect(slugToContentId("--a--b--")).toBe("a-b");
  });

  it("正規化後に空になる入力は例外", () => {
    expect(() => slugToContentId("!!!")).toThrow();
    expect(() => slugToContentId("")).toThrow();
  });
});

describe("createDraft（冪等 upsert: PUT→既存ならPATCH）", () => {
  it("slug由来IDで PUT し、作成された id を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(okId("my-slug"));
    const id = await createDraft(
      "news",
      { slug: "my-slug", title: "T" },
      opts(fetchFn)
    );

    expect(id).toBe("my-slug");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(PUT_URL);
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["X-MICROCMS-API-KEY"]).toBe(
      "write-key"
    );
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
    expect(init.body).toBe(JSON.stringify({ slug: "my-slug", title: "T" }));
  });

  it("既存IDで PUT が 400(already exists)なら PATCH で上書きし、重複を作らない", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(conflict()) // PUT
      .mockResolvedValueOnce(okId("my-slug")); // PATCH

    const id = await createDraft(
      "news",
      { slug: "my-slug", title: "T2" },
      opts(fetchFn)
    );

    expect(id).toBe("my-slug");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][1].method).toBe("PUT");
    expect(fetchFn.mock.calls[1][0]).toBe(PUT_URL);
    expect(fetchFn.mock.calls[1][1].method).toBe("PATCH");
  });

  it("slug が無い payload は例外", async () => {
    const fetchFn = vi.fn<FetchFn>();
    await expect(
      createDraft("news", { title: "no slug" }, opts(fetchFn))
    ).rejects.toThrow(/slug/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("slug が文字列でない payload は例外", async () => {
    const fetchFn = vi.fn<FetchFn>();
    await expect(
      createDraft("news", { slug: ["x"], title: "T" }, opts(fetchFn))
    ).rejects.toThrow(/slug/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("400(already exists以外)はそのまま例外", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => "Syntax error.",
    });
    await expect(
      createDraft("news", { slug: "my-slug", title: "T" }, opts(fetchFn))
    ).rejects.toThrow(/400/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("認証エラー(401)は MicrocmsHttpError として投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "invalid api key",
    });
    await expect(
      createDraft("news", { slug: "my-slug", title: "T" }, opts(fetchFn))
    ).rejects.toBeInstanceOf(MicrocmsHttpError);
  });

  it("PUT 応答に id が無い場合は例外", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({}),
      text: async () => "",
    });
    await expect(
      createDraft("news", { slug: "my-slug", title: "T" }, opts(fetchFn))
    ).rejects.toThrow(/id/);
  });
});

describe("patchDraft", () => {
  it("contentId 指定で status=draft の PATCH を送る", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(okId("abc123"));
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
