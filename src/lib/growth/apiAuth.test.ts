// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bearerToken, safeEqual, unauthorized } from "./apiAuth";

function req(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request("http://localhost/api/growth/x", { method: "POST", headers });
}

describe("safeEqual", () => {
  it("同じ文字列は true", () => {
    expect(safeEqual("secret-token", "secret-token")).toBe(true);
  });
  it("異なる文字列は false", () => {
    expect(safeEqual("secret-token", "wrong-token")).toBe(false);
  });
  it("長さが違っても false(早期 return せず定数時間)", () => {
    expect(safeEqual("abc", "abcdef")).toBe(false);
  });
  it("空文字同士は true", () => {
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("bearerToken", () => {
  it("Bearer ヘッダからトークンを取り出す", () => {
    expect(bearerToken(req("Bearer my-token"))).toBe("my-token");
  });
  it("ヘッダ無しは空文字", () => {
    expect(bearerToken(req())).toBe("");
  });
  it("Bearer 以外のスキームは空文字", () => {
    expect(bearerToken(req("Basic abc"))).toBe("");
  });
  it("Bearer のみ(トークン空)は空文字", () => {
    expect(bearerToken(req("Bearer "))).toBe("");
  });
});

describe("unauthorized", () => {
  it("既定メッセージで 401 JSON", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "認証に失敗しました" });
  });
  it("カスタムメッセージを反映", async () => {
    const res = unauthorized("公開には認証が必要です。");
    expect((await res.json()).error).toBe("公開には認証が必要です。");
  });
});

describe("verifyToken (APPROVE_AUTH_ENABLED 依存)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function load() {
    return (await import("./apiAuth")).verifyToken;
  }

  it("認証無効・denyWhenDisabled 既定(false) は許可(true)", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "false");
    const verify = await load();
    expect(verify(req("Bearer anything"))).toBe(true);
  });

  it("認証無効・denyWhenDisabled=true は常に拒否(false・公開など最強権限)", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "false");
    const verify = await load();
    expect(verify(req("Bearer anything"), true)).toBe(false);
  });

  it("認証有効・正しいトークンは true", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "true");
    vi.stubEnv("APPROVE_SECRET", "right-secret");
    const verify = await load();
    expect(verify(req("Bearer right-secret"))).toBe(true);
  });

  it("認証有効・誤ったトークンは false", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "true");
    vi.stubEnv("APPROVE_SECRET", "right-secret");
    const verify = await load();
    expect(verify(req("Bearer wrong"))).toBe(false);
  });

  it("認証有効・ヘッダ無し＋?token= クエリは後方互換で許可(非推奨フォールバック)", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "true");
    vi.stubEnv("APPROVE_SECRET", "right-secret");
    const verify = await load();
    const r = new Request("http://localhost/api/growth/x?token=right-secret", { method: "POST" });
    expect(verify(r)).toBe(true);
  });

  it("認証有効・ヘッダ無しは false", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "true");
    vi.stubEnv("APPROVE_SECRET", "right-secret");
    const verify = await load();
    expect(verify(req())).toBe(false);
  });

  it("認証有効・APPROVE_SECRET 未設定は false", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "true");
    vi.stubEnv("APPROVE_SECRET", "");
    const verify = await load();
    expect(verify(req("Bearer anything"))).toBe(false);
  });
});
