// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "./http";
import { LINE_PUSH_URL, pushFlexMessage, pushTextMessage } from "./line";
import type { FlexBubble, FlexCarousel } from "./digest-flex";

function res(ok: boolean, status: number, text = ""): HttpResponse {
  return { ok, status, json: async () => ({}), text: async () => text };
}

const TOKEN = "line_token";

afterEach(() => {
  delete process.env.GROWTH_NOTIFY_LEVEL;
});

describe("pushTextMessage", () => {
  it("LINE Messaging API の push に text メッセージを送る", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(true, 200));

    await pushTextMessage("Gabc", "こんにちは", {
      channelAccessToken: TOKEN,
      fetchFn,
      kind: "weekly",
    });

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

  it("失敗時は HTTP ステータスだけを含みresponse本文を捨てる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(false, 401, "invalid token"));

    await expect(
      pushTextMessage("Gabc", "x", { channelAccessToken: TOKEN, fetchFn, kind: "weekly" })
    ).rejects.toThrow(/401/);
    await expect(
      pushTextMessage("Gabc", "x", { channelAccessToken: TOKEN, fetchFn, kind: "weekly" })
    ).rejects.not.toThrow(/invalid token/);
  });

  it("weekly-only 既定では routine メッセージを送信しない", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(true, 200));

    await pushTextMessage("Gabc", "routine", { channelAccessToken: TOKEN, fetchFn });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("GROWTH_NOTIFY_LEVEL=all では routine メッセージも送信する", async () => {
    process.env.GROWTH_NOTIFY_LEVEL = "all";
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(true, 200));

    await pushTextMessage("Gabc", "routine", { channelAccessToken: TOKEN, fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

const bubble: FlexBubble = {
  type: "bubble",
  body: { type: "box", layout: "vertical", contents: [{ type: "text", text: "hi" }] },
};

describe("pushFlexMessage", () => {
  it("flex メッセージを altText 付きで push する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(true, 200));

    await pushFlexMessage("Gabc", "代替テキスト", bubble, {
      channelAccessToken: TOKEN,
      fetchFn,
      kind: "weekly",
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(LINE_PUSH_URL);
    expect(JSON.parse(init.body as string)).toEqual({
      to: "Gabc",
      messages: [{ type: "flex", altText: "代替テキスト", contents: bubble }],
    });
  });

  it("カルーセル(複数バブル)も push できる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(true, 200));
    const carousel: FlexCarousel = { type: "carousel", contents: [bubble, bubble] };

    await pushFlexMessage("Gabc", "代替", carousel, {
      channelAccessToken: TOKEN,
      fetchFn,
      kind: "weekly",
    });

    const [, init] = fetchFn.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      to: "Gabc",
      messages: [{ type: "flex", altText: "代替", contents: carousel }],
    });
  });

  it("失敗時は HTTP ステータスだけを含みresponse本文を捨てる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(false, 400, "bad flex"));

    await expect(
      pushFlexMessage("Gabc", "x", bubble, { channelAccessToken: TOKEN, fetchFn, kind: "weekly" })
    ).rejects.toThrow(/400/);
  });
});
