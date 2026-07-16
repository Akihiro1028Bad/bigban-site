// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DELETE, POST } from "./route";
import type { InMemoryFailureStore } from "@/lib/growth/authRateLimit";

const BASE = "https://example.test/api/growth/auth/session";

function request(body: unknown, hasCsrf = true): Request {
  return new Request(BASE, {
    method: "POST",
    headers: hasCsrf ? { "content-type": "application/json", "x-growth-request": "1" } : {},
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.APPROVE_SECRET = "right";
  process.env.APPROVE_SESSION_SECRET = "signing-key";
  globalThis.__growthAuthFailureStore = undefined;
});

afterEach(() => {
  delete process.env.APPROVE_SECRET;
  delete process.env.APPROVE_SESSION_SECRET;
});

describe("/api/growth/auth/session", () => {
  it("成功時にsecret非含有のJSONと30分HttpOnly Strict cookieを返す", async () => {
    const response = await POST(request({ passphrase: "right" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(JSON.stringify(body)).not.toContain("right");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("growth_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Max-Age=1800");
    expect(cookie).not.toContain("Domain=");
  });

  it("不正入力/JSON/CSRFを400、誤入力を401にする", async () => {
    expect((await POST(request({ passphrase: "" }))).status).toBe(400);
    expect((await POST(new Request(BASE, { method: "POST", headers: { "x-growth-request": "1" }, body: "{" }))).status).toBe(400);
    expect((await POST(request({ passphrase: "right" }, false))).status).toBe(400);
    expect((await POST(request({ passphrase: "wrong" }))).status).toBe(401);
  });

  it("6回目を429+Retry-After、env欠落を503にする", async () => {
    let response = new Response();
    for (let index = 0; index < 6; index += 1) response = await POST(request({ passphrase: "wrong" }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    delete process.env.APPROVE_SESSION_SECRET;
    expect((await POST(request({ passphrase: "right" }))).status).toBe(503);
    process.env.APPROVE_SESSION_SECRET = "signing-key";
    delete process.env.APPROVE_SECRET;
    expect((await POST(request({ passphrase: "right" }))).status).toBe(503);
  });

  it("rate limit backend失敗とproduction設定欠落を503にする", async () => {
    globalThis.__growthAuthFailureStore = {
      incrementFailure: async () => { throw new Error("down"); },
    } as unknown as InMemoryFailureStore;
    expect((await POST(request({ passphrase: "wrong" }))).status).toBe(503);
  });

  it("DELETEでsessionとscope cookieを失効する", async () => {
    expect((await DELETE(new Request(BASE, { method: "DELETE" }))).status).toBe(400);
    const response = await DELETE(
      new Request(BASE, { method: "DELETE", headers: { "x-growth-request": "1" } })
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("growth_session=");
    expect(cookie).toContain("growth_step_up_publish=");
    expect(cookie).toContain("growth_step_up_media=");
    expect(cookie).toContain("Max-Age=0");
  });
});
