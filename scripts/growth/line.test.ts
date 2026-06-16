// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "./http";
import { LINE_PUSH_URL, pushTextMessage } from "./line";

function res(ok: boolean, status: number, text = ""): HttpResponse {
  return { ok, status, json: async () => ({}), text: async () => text };
}

const TOKEN = "line_token";

describe("pushTextMessage", () => {
  it("LINE Messaging API の push に text メッセージを送る", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(true, 200));

    await pushTextMessage("Gabc", "こんにちは", { channelAccessToken: TOKEN, fetchFn });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(LINE_PUSH_URL);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      to: "Gabc",
      messages: [{ type: "text", text: "こんにちは" }],
    });
  });

  it("失敗時は HTTP ステータス付きで throw する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(false, 401, "invalid token"));

    await expect(
      pushTextMessage("Gabc", "x", { channelAccessToken: TOKEN, fetchFn })
    ).rejects.toThrow(/401.*invalid token/);
  });
});
