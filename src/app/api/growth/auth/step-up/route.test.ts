// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { growthAuthHeaders } from "@/test/growthAuth";
import type { InMemoryFailureStore } from "@/lib/growth/authRateLimit";

import { POST } from "./route";

const BASE = "https://example.test/api/growth/auth/step-up";

function request(body: unknown, token: string | null = "right"): Request {
  return new Request(BASE, {
    method: "POST",
    headers: { ...growthAuthHeaders(token), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.APPROVE_SECRET = "right";
  globalThis.__growthAuthFailureStore = undefined;
});

afterEach(() => {
  delete process.env.APPROVE_SECRET;
  delete process.env.APPROVE_SESSION_SECRET;
});

describe("/api/growth/auth/step-up", () => {
  it("通常session必須でscope別5分cookieを発行する", async () => {
    expect((await POST(request({ passphrase: "right", scope: "publish" }, null))).status).toBe(401);
    const response = await POST(request({ passphrase: "right", scope: "publish" }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("growth_step_up_publish=");
    expect(cookie).toContain("Max-Age=300");
    expect(cookie).toContain("HttpOnly");
  });

  it("JSON/入力不正を400、誤入力を401、env欠落を503にする", async () => {
    const headers = growthAuthHeaders("right");
    expect((await POST(new Request(BASE, { method: "POST", headers, body: "{" }))).status).toBe(400);
    expect((await POST(request({ passphrase: "right", scope: "admin" }))).status).toBe(400);
    expect((await POST(request({ passphrase: "wrong", scope: "media" }))).status).toBe(401);
    const missingEnvRequest = request({ passphrase: "right", scope: "media" });
    delete process.env.APPROVE_SECRET;
    expect((await POST(missingEnvRequest)).status).toBe(503);
  });

  it("誤入力6回目を429にする", async () => {
    let response = new Response();
    for (let index = 0; index < 6; index += 1) {
      response = await POST(request({ passphrase: "wrong", scope: "media" }));
    }
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).not.toBeNull();
  });

  it("rate limit backend失敗を503にする", async () => {
    globalThis.__growthAuthFailureStore = {
      incrementFailure: async () => { throw new Error("down"); },
    } as unknown as InMemoryFailureStore;
    expect((await POST(request({ passphrase: "wrong", scope: "publish" }))).status).toBe(503);
  });
});
