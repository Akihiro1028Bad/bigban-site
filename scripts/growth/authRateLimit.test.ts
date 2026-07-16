// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  InMemoryFailureStore,
  checkAuthAttempt,
  clientIp,
  hashClientIp,
  localFailureStore,
} from "./authRateLimit";

describe("authRateLimit", () => {
  it("正しい認証を繰り返しても失敗枠を消費しない", async () => {
    const store = new InMemoryFailureStore();
    const request = {
      expected: "right",
      supplied: "right",
      ip: "203.0.113.1",
      hmacKey: "key",
      store,
      nowMs: 1_000,
    };

    for (let index = 0; index < 6; index += 1) {
      await expect(checkAuthAttempt(request)).resolves.toEqual({ status: "valid" });
    }
  });

  it("同一IPの誤入力は5回まで401、6回目から429になる", async () => {
    const store = new InMemoryFailureStore();
    const base = { expected: "right", ip: "203.0.113.1", hmacKey: "key", store, nowMs: 1_000 };
    for (let index = 0; index < 5; index += 1) {
      await expect(checkAuthAttempt({ ...base, supplied: "wrong" })).resolves.toMatchObject({
        status: "invalid",
      });
    }
    await expect(checkAuthAttempt({ ...base, supplied: "wrong" })).resolves.toMatchObject({
      status: "limited",
      retryAfterSeconds: 900,
    });
    await expect(checkAuthAttempt({ ...base, supplied: "right" })).resolves.toMatchObject({
      status: "limited",
    });
  });

  it("IPを分離し、15分後にwindowをリセットする", async () => {
    const store = new InMemoryFailureStore();
    const request = { expected: "right", supplied: "wrong", hmacKey: "key", store };
    for (let index = 0; index < 6; index += 1) {
      await checkAuthAttempt({ ...request, ip: "a", nowMs: 0 });
    }
    await expect(checkAuthAttempt({ ...request, ip: "b", nowMs: 0 })).resolves.toMatchObject({ status: "invalid" });
    await expect(checkAuthAttempt({ ...request, ip: "a", nowMs: 900_001 })).resolves.toMatchObject({ status: "invalid" });
  });

  it("Vercel forwarded IPを優先し、生IPではなくHMAC keyを使う", async () => {
    const request = new Request("https://example.test", {
      headers: { "x-vercel-forwarded-for": "198.51.100.2, 10.0.0.1", "x-forwarded-for": "other" },
    });
    expect(clientIp(request)).toBe("198.51.100.2");
    expect(hashClientIp("198.51.100.2", "key")).not.toContain("198.51.100.2");
    expect(clientIp(new Request("https://example.test"))).toBe("unknown");
    expect(clientIp(new Request("https://example.test", { headers: { "x-forwarded-for": " , next" } }))).toBe("unknown");
  });

  it("store通信失敗はservice unavailableへ倒す", async () => {
    const store = {
      failureCount: async () => { throw new Error("redis secret"); },
      incrementFailure: async () => ({ count: 1, resetAt: 1 }),
    };
    await expect(
      checkAuthAttempt({ expected: "right", supplied: "right", ip: "a", hmacKey: "key", store })
    ).resolves.toEqual({ status: "unavailable" });
    await expect(checkAuthAttempt({
      expected: "right",
      supplied: "wrong",
      ip: "a",
      hmacKey: "key",
      store: {
        failureCount: async () => ({ count: 0, resetAt: 0 }),
        incrementFailure: async () => { throw new Error("redis secret"); },
      },
    })).resolves.toEqual({ status: "unavailable" });
  });

  it("上限超過時は合言葉を読み取らず比較しない", async () => {
    const store = {
      failureCount: async () => ({ count: 5, resetAt: 901_000 }),
      incrementFailure: async () => ({ count: 6, resetAt: 901_000 }),
    };
    const input = {
      expected: "right",
      get supplied(): string {
        throw new Error("passphrase comparison must not run");
      },
      ip: "a",
      hmacKey: "key",
      store,
      nowMs: 1_000,
    };

    await expect(checkAuthAttempt(input)).resolves.toEqual({
      status: "limited",
      retryAfterSeconds: 900,
    });
  });

  it("並行した誤入力で上限を超えた場合はそのリクエストから429にする", async () => {
    const store = {
      failureCount: async () => ({ count: 4, resetAt: 901_000 }),
      incrementFailure: async () => ({ count: 6, resetAt: 901_000 }),
    };

    await expect(checkAuthAttempt({
      expected: "right",
      supplied: "wrong",
      ip: "a",
      hmacKey: "key",
      store,
      nowMs: 1_000,
    })).resolves.toEqual({ status: "limited", retryAfterSeconds: 900 });
  });

  it("現在時刻の既定・空expected・retry最小値とglobal store再利用を扱う", async () => {
    const store = {
      failureCount: async () => ({ count: 5, resetAt: 0 }),
      incrementFailure: async () => ({ count: 6, resetAt: 0 }),
    };
    await expect(
      checkAuthAttempt({ expected: "", supplied: "", ip: "a", hmacKey: "key", store })
    ).resolves.toEqual({ status: "limited", retryAfterSeconds: 1 });
    globalThis.__growthAuthFailureStore = undefined;
    expect(localFailureStore()).toBe(localFailureStore());
  });
});
