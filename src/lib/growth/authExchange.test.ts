// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpstashFailureStore, failureStoreFromEnv } from "./authExchange";

afterEach(() => vi.unstubAllEnvs());

describe("authExchange", () => {
  it("local/testではin-memory storeを再利用する", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(failureStoreFromEnv()).toMatchObject({ status: "ready" });
    expect(failureStoreFromEnv()).toEqual(failureStoreFromEnv());
  });

  it("productionでUpstash設定欠落はfail-closed、設定済みはstoreを返す", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(failureStoreFromEnv()).toEqual({ status: "unavailable" });
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    expect(failureStoreFromEnv()).toMatchObject({ status: "ready" });
  });

  it("Upstash Lua応答をcount/resetへ変換し、HTTP/形式異常を拒否する", async () => {
    const okFetch = vi.fn().mockResolvedValue(Response.json({ result: [2, 5000] }));
    const store = new UpstashFailureStore("https://redis.test", "token", okFetch);
    await expect(store.incrementFailure("hash", 1000, 900_000)).resolves.toEqual({ count: 2, resetAt: 6000 });
    expect(okFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer token");
    const requestBody: unknown = JSON.parse(String(okFetch.mock.calls[0][1].body));
    expect(requestBody).toEqual([
      "EVAL",
      expect.stringMatching(/INCR.*PEXPIRE/),
      "1",
      "hash",
      "900000",
    ]);

    const badStatus = new UpstashFailureStore("x", "t", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    await expect(badStatus.incrementFailure("k", 0, 1)).rejects.toThrow("unavailable");
    const badBody = new UpstashFailureStore("x", "t", vi.fn().mockResolvedValue(Response.json({ result: "bad" })));
    await expect(badBody.incrementFailure("k", 0, 1)).rejects.toThrow("invalid");
    for (const result of [null, {}, ["2", 1], [2, "1"]]) {
      const invalid = new UpstashFailureStore("x", "t", vi.fn().mockResolvedValue(Response.json(result === null ? null : { result })));
      await expect(invalid.incrementFailure("k", 0, 1)).rejects.toThrow("invalid");
    }
  });
});
