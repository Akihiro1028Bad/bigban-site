// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { fetchGoogleAccessToken } from "./googleToken";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const env = { GROWTH_GOOGLE_CLIENT_ID: "id", GROWTH_GOOGLE_CLIENT_SECRET: "secret", GROWTH_GOOGLE_REFRESH_TOKEN: "refresh" };

describe("fetchGoogleAccessToken", () => {
  it("リフレッシュトークンでアクセストークンを取る", async () => {
    let body = "";
    server.use(
      http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ access_token: "tok" });
      }),
    );
    await expect(fetchGoogleAccessToken(env)).resolves.toBe("tok");
    expect(body).toContain("grant_type=refresh_token");
  });

  it("必要な環境変数が欠けていれば、通信せずに例外", async () => {
    await expect(fetchGoogleAccessToken({ ...env, GROWTH_GOOGLE_REFRESH_TOKEN: undefined })).rejects.toThrow("GROWTH_GOOGLE_REFRESH_TOKEN");
  });

  it("HTTP エラーは状態コードつきで例外", async () => {
    server.use(http.post("https://oauth2.googleapis.com/token", () => new HttpResponse(null, { status: 400 })));
    await expect(fetchGoogleAccessToken(env)).rejects.toThrow("Google OAuth 失敗: 400");
  });

  it("応答に access_token が無ければ例外", async () => {
    server.use(http.post("https://oauth2.googleapis.com/token", () => HttpResponse.json({})));
    await expect(fetchGoogleAccessToken(env)).rejects.toThrow("access_token");
  });
});
