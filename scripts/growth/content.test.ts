// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import {
  createDraft,
  patchDraft,
  publishContent,
  slugToContentId,
  resolveRetryConfig,
  ContentTimeoutError,
  DEFAULT_RETRY,
  MicrocmsHttpError,
  type ContentApiOptions,
} from "./content";
import type { FetchFn } from "./http";

function opts(
  fetchFn: FetchFn,
  extra: Partial<ContentApiOptions> = {}
): ContentApiOptions {
  return {
    serviceDomain: "thepicklebang",
    apiKey: "write-key",
    fetchFn,
    sleep: async () => {},
    ...extra,
  };
}

const serverError = () =>
  ({
    ok: false,
    status: 503,
    json: async () => ({}),
    text: async () => "service unavailable",
  }) as Awaited<ReturnType<FetchFn>>;

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
  it("MicrocmsHttpError の既定値は already-exists ではない", () => {
    expect(new MicrocmsHttpError("microcms.create", 500, "req-1").isAlreadyExists).toBe(false);
  });

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

  it("更新先contentIdを指定してもpayloadの元slugを維持する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(okId("stable-content-id"));

    const id = await createDraft(
      "news",
      { slug: "Pickleball Skill_Roadmap!", title: "T2" },
      opts(fetchFn),
      "stable-content-id"
    );

    expect(id).toBe("stable-content-id");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://thepicklebang.microcms.io/api/v1/news/stable-content-id?status=draft"
    );
    expect(init.body).toBe(
      JSON.stringify({ slug: "Pickleball Skill_Roadmap!", title: "T2" })
    );
  });

  it("不正な更新先contentIdは送信前に拒否する", async () => {
    const fetchFn = vi.fn<FetchFn>();

    await expect(
      createDraft("news", { slug: "original-slug" }, opts(fetchFn), "../other")
    ).rejects.toThrow(/contentId/);
    expect(fetchFn).not.toHaveBeenCalled();
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

describe("publishContent (#167)", () => {
  function okStatus() {
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" } as Awaited<
      ReturnType<FetchFn>
    >;
  }

  it("Management API のステータス変更エンドポイントへ PUBLISH を PATCH する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(okStatus());
    await publishContent("news", "abc123", {
      serviceDomain: "thepicklebang",
      apiKey: "mgmt-key",
      fetchFn,
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://thepicklebang.microcms-management.io/api/v1/contents/news/abc123/status"
    );
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["X-MICROCMS-API-KEY"]).toBe("mgmt-key");
    expect(JSON.parse(init.body as string)).toEqual({ status: ["PUBLISH"] });
  });

  it("contentId は URL エンコードする", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(okStatus());
    await publishContent("news", "a b/c", { serviceDomain: "d", apiKey: "k", fetchFn });
    expect(fetchFn.mock.calls[0][0]).toContain("/contents/news/a%20b%2Fc/status");
  });

  it("非 2xx は例外(ステータス込み)を投げる", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValue({ ok: false, status: 403, json: async () => ({}), text: async () => "forbidden" } as Awaited<
        ReturnType<FetchFn>
      >);
    const error = await publishContent("news", "abc123", {
      serviceDomain: "d",
      apiKey: "k",
      fetchFn,
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/HTTP 403/);
    expect((error as Error).message).not.toContain("forbidden");
  });
});

describe("リトライ＋指数バックオフ＋タイムアウト (#22)", () => {
  it("5xx は指数バックオフで再試行し、成功すれば id を返す", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(okId("abc123"));
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});

    const id = await patchDraft("news", "abc123", {}, opts(fetchFn, { sleep }));

    expect(id).toBe("abc123");
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    // 指数バックオフ: 1回目 base, 2回目 base*2
    expect(sleep.mock.calls[0][0]).toBeLessThan(sleep.mock.calls[1][0]);
  });

  it("ネットワークエラー（fetch が throw）も再試行する", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(okId("abc123"));

    const id = await patchDraft("news", "abc123", {}, opts(fetchFn));
    expect(id).toBe("abc123");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("4xx は再試行せず即失敗する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
      text: async () => "unprocessable",
    });
    await expect(
      patchDraft("news", "abc123", {}, opts(fetchFn))
    ).rejects.toThrow(/422/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("5xx が続けば上限回数で明確に失敗する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(serverError());
    await expect(
      patchDraft("news", "abc123", {}, opts(fetchFn, { retry: { maxAttempts: 3 } }))
    ).rejects.toThrow(/503/);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("ネットワークエラーが続けば上限回数で失敗する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(
      patchDraft("news", "abc123", {}, opts(fetchFn, { retry: { maxAttempts: 2 } }))
    ).rejects.toThrow(/ETIMEDOUT/);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("sleep 未注入時は既定の setTimeout ベースで待機して再試行する", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi
        .fn<FetchFn>()
        .mockResolvedValueOnce(serverError())
        .mockResolvedValueOnce(okId("abc123"));
      // sleep を注入しない = defaultSleep(setTimeout) を使う
      const p = patchDraft("news", "abc123", {}, {
        serviceDomain: "thepicklebang",
        apiKey: "write-key",
        fetchFn,
      });
      // 初回バックオフ = baseDelayMs(500)
      await vi.advanceTimersByTimeAsync(500);
      await expect(p).resolves.toBe("abc123");
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("AbortController でタイムアウトすると ContentTimeoutError として失敗する(自前abortを明示)", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn<FetchFn>().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new Error("aborted"))
            );
          })
      );
      const p = patchDraft(
        "news",
        "abc123",
        {},
        opts(fetchFn, { retry: { maxAttempts: 1, timeoutMs: 1000 }, sleep: async () => {} })
      );
      const assertion = expect(p).rejects.toBeInstanceOf(ContentTimeoutError);
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      expect(fetchFn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ContentTimeoutError のメッセージにタイムアウト時間(ms)を含む", () => {
    const err = new ContentTimeoutError(45000);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ContentTimeoutError");
    expect(err.message).toMatch(/タイムアウト/);
    expect(err.message).toContain("45000");
  });
});

describe("DEFAULT_RETRY", () => {
  it("1リクエストのタイムアウトは microCMS の重い書き込みに耐える 45 秒", () => {
    // 15 秒では重い create を誤アボートしていた(#58)。
    expect(DEFAULT_RETRY.timeoutMs).toBe(45000);
  });
});

describe("resolveRetryConfig（env 上書き）", () => {
  it("GROWTH_MICROCMS_TIMEOUT_MS / MAX_ATTEMPTS を正の整数として取り込む", () => {
    expect(
      resolveRetryConfig({
        GROWTH_MICROCMS_TIMEOUT_MS: "60000",
        GROWTH_MICROCMS_MAX_ATTEMPTS: "3",
      })
    ).toEqual({ timeoutMs: 60000, maxAttempts: 3 });
  });

  it("未設定なら何も上書きしない(空オブジェクト=既定を使う)", () => {
    expect(resolveRetryConfig({})).toEqual({});
  });

  it("不正値(非数値・0・負)は無視する", () => {
    expect(
      resolveRetryConfig({
        GROWTH_MICROCMS_TIMEOUT_MS: "abc",
        GROWTH_MICROCMS_MAX_ATTEMPTS: "0",
      })
    ).toEqual({});
    expect(resolveRetryConfig({ GROWTH_MICROCMS_TIMEOUT_MS: "-5" })).toEqual({});
  });
});

describe("createDraft の着地確認（false-negative 回避 / #58）", () => {
  const notFound = () =>
    ({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "not found",
    }) as Awaited<ReturnType<FetchFn>>;

  it("PUT が着地不明(ネットワーク失敗)でも、PATCH 照合で実在すれば成功扱い", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockRejectedValueOnce(new Error("ECONNRESET")) // PUT(着地したかは不明)
      .mockResolvedValueOnce(okId("my-slug")); // 照合 PATCH → 実在＝成功
    const id = await createDraft(
      "news",
      { slug: "my-slug", title: "T" },
      opts(fetchFn, { retry: { maxAttempts: 1 } })
    );
    expect(id).toBe("my-slug");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][1].method).toBe("PUT");
    expect(fetchFn.mock.calls[1][1].method).toBe("PATCH");
  });

  it("5xx 枯渇後も PATCH 照合で実在すれば成功扱い", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(serverError()) // PUT 503
      .mockResolvedValueOnce(okId("my-slug")); // 照合 PATCH
    const id = await createDraft(
      "news",
      { slug: "my-slug", title: "T" },
      opts(fetchFn, { retry: { maxAttempts: 1 } })
    );
    expect(id).toBe("my-slug");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("着地不明＋PATCH 照合も 404(未作成)なら、元のエラーを投げる", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockRejectedValueOnce(new Error("ECONNRESET")) // PUT
      .mockResolvedValueOnce(notFound()); // 照合 PATCH → 未作成
    await expect(
      createDraft(
        "news",
        { slug: "my-slug", title: "T" },
        opts(fetchFn, { retry: { maxAttempts: 1 } })
      )
    ).rejects.toThrow(/ECONNRESET/);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("4xx(422)は着地していないので PATCH 照合せず即失敗する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
      text: async () => "unprocessable",
    });
    await expect(
      createDraft(
        "news",
        { slug: "my-slug", title: "T" },
        opts(fetchFn, { retry: { maxAttempts: 1 } })
      )
    ).rejects.toThrow(/422/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
