// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: vi.fn((callback: () => unknown) => {
    void callback();
  }),
}));

vi.mock("@/lib/growth/notion", async (orig) => ({
  ...(await orig<typeof import("@/lib/growth/notion")>()),
  createPage: vi.fn(),
  getPage: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: false } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { after } from "next/server";

import { createPage, getPage } from "@/lib/growth/notion";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function postRequest(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/learning-log/reject");
  const headers = token === null ? undefined : { authorization: `Bearer ${token}` };
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}

function rawPostRequest(raw: string): Request {
  return new Request("http://localhost/api/growth/learning-log/reject", {
    method: "POST",
    body: raw,
  });
}

function rejectedFix(aspect = "冗長") {
  return { aspect, detail: "短くする", before: "<p>前</p>", after: "<p>後</p>" };
}

function pageWithTitle(title = "記事タイトル") {
  return {
    id: PAGE_ID,
    url: "",
    properties: { "タイトル案": { title: [{ plain_text: title }] } },
  };
}

beforeEach(() => {
  flags.authEnabled = false;
  delete process.env.GROWTH_LEARNING_LOG_DS;
  process.env.NOTION_TOKEN = "notion-token";
  delete process.env.APPROVE_SECRET;
  vi.mocked(after).mockClear();
  vi.mocked(createPage).mockReset();
  vi.mocked(createPage).mockResolvedValue("learning-log-page");
  vi.mocked(getPage).mockReset();
  vi.mocked(getPage).mockResolvedValue(pageWithTitle());
});

afterEach(() => {
  delete process.env.GROWTH_LEARNING_LOG_DS;
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
});

describe("POST /api/growth/learning-log/reject", () => {
  it("認証なしは 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await POST(postRequest(null, { pageId: PAGE_ID, source: "sentence", rejectedFixes: [rejectedFix()] }));
    expect(res.status).toBe(401);
  });

  it.each([
    { pageId: "invalid", source: "sentence", rejectedFixes: [rejectedFix()] },
    { pageId: PAGE_ID, source: "sentence", rejectedFixes: [] },
    { pageId: PAGE_ID, source: "sentence", rejectedFixes: Array.from({ length: 21 }, () => rejectedFix()) },
    { pageId: PAGE_ID, source: "sentence", rejectedFixes: [{ aspect: "冗長" }] },
    { pageId: PAGE_ID, source: "x".repeat(65), rejectedFixes: [rejectedFix()] },
    { pageId: PAGE_ID, source: 1, rejectedFixes: [rejectedFix()] },
  ])("不正な入力は 400", async (body) => {
    const res = await POST(postRequest(null, body));
    expect(res.status).toBe(400);
  });

  it("不正な JSON は 400", async () => {
    const res = await POST(rawPostRequest("{invalid"));
    expect(res.status).toBe(400);
  });

  it("ログDB未設定時は記録せず success と skipped を返す", async () => {
    const res = await POST(postRequest(null, { pageId: PAGE_ID, source: "sentence", rejectedFixes: [rejectedFix()] }));
    expect(await res.json()).toEqual({ success: true, skipped: true });
    expect(getPage).not.toHaveBeenCalled();
    expect(createPage).not.toHaveBeenCalled();
  });

  it("fix ごとに不採用の学習ログを after で追記する", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "learning-log-ds";
    const res = await POST(
      postRequest(null, { pageId: PAGE_ID, source: "advice", rejectedFixes: [rejectedFix("冗長"), rejectedFix("根拠")] })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(after).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(createPage).toHaveBeenCalledTimes(2));
    const firstProps = vi.mocked(createPage).mock.calls[0][1];
    expect(firstProps["種別"]).toEqual({ select: { name: "不採用" } });
    expect(firstProps["対象"]).toEqual(expect.objectContaining({ rich_text: expect.any(Array) }));
    expect(firstProps["要約"]).toEqual({
      rich_text: [
        {
          text: {
            content: "不採用(advice)\n[冗長] 短くする\n変更前: 前\n変更後: 後",
          },
        },
      ],
    });
  });

  it("NOTION_TOKEN 未設定時は 500", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "learning-log-ds";
    delete process.env.NOTION_TOKEN;
    const res = await POST(
      postRequest(null, { pageId: PAGE_ID, source: "sentence", rejectedFixes: [rejectedFix()] })
    );
    expect(res.status).toBe(500);
  });

  it("対象ページを取得できない時は 404", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "learning-log-ds";
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await POST(
      postRequest(null, { pageId: PAGE_ID, source: "sentence", rejectedFixes: [rejectedFix()] })
    );
    expect(res.status).toBe(404);
  });

  it("学習ログ追記に失敗しても success を返す", async () => {
    process.env.GROWTH_LEARNING_LOG_DS = "learning-log-ds";
    vi.mocked(createPage).mockRejectedValue(new Error("notion down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(postRequest(null, { pageId: PAGE_ID, source: "sentence", rejectedFixes: [rejectedFix()] }));
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });
});
