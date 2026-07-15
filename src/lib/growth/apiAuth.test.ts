// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueSession, issueStepUp } from "./authSession";
import { privilegedAuthFailure, safeEqual, stepUpRequired, unauthorized } from "./apiAuth";

const KEY = "session-signing-secret";

function headers(cookie = "", isUnsafe = true): HeadersInit {
  return { cookie, ...(isUnsafe ? { "x-growth-request": "1" } : {}) };
}

describe("safeEqual", () => {
  it.each([["same", "same", true], ["a", "b", false], ["", "", true], ["a", "long", false]])(
    "値を定数時間比較する",
    (left, right, expected) => expect(safeEqual(left, right)).toBe(expected)
  );
});

describe("認証response", () => {
  it("401とstep-up 403をJSONで返す", async () => {
    expect(await unauthorized().json()).toEqual({ success: false, error: "認証に失敗しました" });
    const response = stepUpRequired("publish");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "STEP_UP_REQUIRED", scope: "publish" });
    expect(privilegedAuthFailure("unauthorized", "media", "no").status).toBe(401);
    expect(privilegedAuthFailure("step-up-required", "media", "no").status).toBe(403);
    expect((await unauthorized("custom").json()).error).toBe("custom");
  });
});

describe("Cookie認証", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  async function load(enabled = "true") {
    vi.stubEnv("APPROVE_AUTH_ENABLED", enabled);
    vi.stubEnv("APPROVE_SESSION_SECRET", KEY);
    return import("./apiAuth");
  }

  it("有効なCookieとunsafe headerを許可する", async () => {
    const auth = await load();
    const session = issueSession(KEY);
    const request = new Request("https://x.test/api/growth/x", {
      method: "POST",
      headers: headers(`growth_session=${session.token}`),
    });
    expect(auth.verifyToken(request)).toBe(true);
  });

  it("Cookie欠落・署名不正・CSRF欠落・Bearer・query tokenを拒否する", async () => {
    const auth = await load();
    const session = issueSession(KEY);
    const base = `growth_session=${session.token}`;
    expect(auth.verifyToken(new Request("https://x.test", { method: "POST", headers: headers() }))).toBe(false);
    expect(auth.verifyToken(new Request("https://x.test", { method: "POST", headers: headers(`${base}x`) }))).toBe(false);
    expect(auth.verifyToken(new Request("https://x.test", { method: "POST", headers: { cookie: base } }))).toBe(false);
    expect(auth.verifyToken(new Request("https://x.test", { method: "POST", headers: { ...headers(base), authorization: "Bearer old" } }))).toBe(false);
    expect(auth.verifyToken(new Request("https://x.test?token=old", { method: "GET", headers: headers(base, false) }))).toBe(false);
    expect(auth.authenticatedSession(new Request("https://x.test", { headers: { cookie: "growth_session=%broken" } }))).toBeNull();
    delete process.env.APPROVE_SESSION_SECRET;
    expect(auth.authenticatedSession(new Request("https://x.test", { headers: { cookie: base } }))).toBeNull();
  });

  it("認証無効時は通常APIだけ許可し強権は拒否する", async () => {
    const auth = await load("false");
    const request = new Request("https://x.test", { method: "POST" });
    expect(auth.verifyToken(request)).toBe(true);
    expect(auth.verifyToken(request, true)).toBe(false);
    expect(auth.verifyPrivileged(request, "publish")).toBe("unauthorized");
  });

  it("scopeと親sidを分離する", async () => {
    const auth = await load();
    const session = issueSession(KEY, { sid: "parent" });
    const publish = issueStepUp(KEY, "parent", "publish");
    const cookie = `growth_session=${session.token}; growth_step_up_publish=${publish.token}`;
    const request = new Request("https://x.test", { method: "POST", headers: headers(cookie) });
    expect(auth.verifyPrivileged(request, "publish")).toBe("authorized");
    expect(auth.verifyPrivileged(request, "media")).toBe("step-up-required");
    const legacy = new Request("https://x.test", { method: "POST", headers: { ...headers(cookie), authorization: "Bearer old" } });
    expect(auth.verifyPrivileged(legacy, "publish")).toBe("unauthorized");
    expect(auth.verifyPrivileged(new Request("https://x.test", { method: "POST", headers: headers() }), "publish")).toBe("unauthorized");
  });

  it("GET/HEAD/OPTIONSはCSRFヘッダ不要", async () => {
    const auth = await load();
    const session = issueSession(KEY);
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(auth.verifyToken(new Request("https://x.test", { method, headers: { cookie: `growth_session=${session.token}` } }))).toBe(true);
    }
  });
});
