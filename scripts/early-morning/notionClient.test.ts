// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "../growth/http";
import { NotionApiError, createNotionClient } from "./notionClient";

function res(status: number, body: unknown, retryAfter: string | null = null): HttpResponse {
  return {
    ok: status < 400,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? retryAfter : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function client(fetchFn: FetchFn) {
  const sleep = vi.fn(async () => undefined);
  return { sleep, notion: createNotionClient({ token: "secret_test", fetchFn, sleep, maxRetries: 2 }) };
}

describe("createNotionClient", () => {
  it("ページングして全件を返し、filter_properties を付ける", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(res(200, { results: [{ id: "a", properties: {} }], has_more: true, next_cursor: "c1" }))
      .mockResolvedValueOnce(res(200, { results: [{ id: "b", properties: {} }], has_more: false, next_cursor: null }));
    const { notion } = client(fetchFn);

    const pages = await notion.queryAll("db1", { filter: { x: 1 } }, ["p%1", "p2"]);

    expect(pages.map((p) => p.id)).toEqual(["a", "b"]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.notion.com/v1/databases/db1/query?filter_properties=p%251&filter_properties=p2");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ filter: { x: 1 }, page_size: 100 });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret_test");
    expect((init.headers as Record<string, string>)["Notion-Version"]).toBe("2022-06-28");
    expect(JSON.parse(String(fetchFn.mock.calls[1][1].body))).toEqual({ filter: { x: 1 }, page_size: 100, start_cursor: "c1" });
  });

  it("429 は Retry-After 秒待って再試行、5xx は1秒待って再試行", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(res(429, {}, "3"))
      .mockResolvedValueOnce(res(502, {}))
      .mockResolvedValueOnce(res(200, { properties: { 名前: { id: "t" } } }));
    const { notion, sleep } = client(fetchFn);

    await expect(notion.getDatabase("db1")).resolves.toEqual({ properties: { 名前: { id: "t" } } });
    expect(sleep.mock.calls).toEqual([[3000], [1000]]);
  });

  it("headers のない応答でも1秒待って再試行する", async () => {
    const noHeaders: HttpResponse = { ok: false, status: 500, json: async () => ({}), text: async () => "" };
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(noHeaders).mockResolvedValueOnce(res(200, { id: "p" }));
    const { notion, sleep } = client(fetchFn);
    await notion.updatePage("p", {});
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("Retry-After がなければ1秒", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(res(429, {})).mockResolvedValueOnce(res(200, { id: "p" }));
    const { notion, sleep } = client(fetchFn);
    await notion.updatePage("p", {});
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("再試行を使い切るか 4xx なら NotionApiError", async () => {
    const tooMany = vi.fn<FetchFn>().mockResolvedValue(res(503, { message: "down" }));
    await expect(client(tooMany).notion.archivePage("p")).rejects.toThrow(NotionApiError);
    expect(tooMany).toHaveBeenCalledTimes(3);

    const bad = vi.fn<FetchFn>().mockResolvedValue(res(400, { message: "bad" }));
    await expect(client(bad).notion.createPage("db", {})).rejects.toMatchObject({ status: 400 });
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("ページ作成・更新・アーカイブ・ブロック操作の HTTP を組み立てる", async () => {
    const fetchFn = vi.fn<FetchFn>(async (url, init) => {
      if (url.includes("/children") && init.method === "GET") {
        return res(200, url.includes("start_cursor")
          ? { results: [{ id: "b2", type: "code" }], has_more: false, next_cursor: null }
          : { results: [{ id: "b1", type: "paragraph" }], has_more: true, next_cursor: "k" });
      }
      return res(200, { id: "new", properties: {} });
    });
    const { notion } = client(fetchFn);

    await expect(notion.createPage("db", { a: 1 })).resolves.toEqual({ id: "new", properties: {} });
    await notion.updatePage("p", { b: 2 });
    await notion.archivePage("p");
    await expect(notion.listChildren("pg")).resolves.toEqual([{ id: "b1", type: "paragraph" }, { id: "b2", type: "code" }]);
    await notion.deleteBlock("b1");
    await notion.appendChildren("pg", [{ type: "code" }]);

    const calls = fetchFn.mock.calls.map(([url, init]) => `${init.method} ${url} ${init.body ?? ""}`);
    expect(calls).toEqual([
      'POST https://api.notion.com/v1/pages {"parent":{"database_id":"db"},"properties":{"a":1}}',
      'PATCH https://api.notion.com/v1/pages/p {"properties":{"b":2}}',
      'PATCH https://api.notion.com/v1/pages/p {"archived":true}',
      "GET https://api.notion.com/v1/blocks/pg/children?page_size=100 ",
      "GET https://api.notion.com/v1/blocks/pg/children?page_size=100&start_cursor=k ",
      "DELETE https://api.notion.com/v1/blocks/b1 ",
      'PATCH https://api.notion.com/v1/blocks/pg/children {"children":[{"type":"code"}]}',
    ]);
  });

  it("応答の形が違えばエラー", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(200, { unexpected: true }));
    await expect(client(fetchFn).notion.queryAll("db")).rejects.toThrow(NotionApiError);
  });

  it("maxRetries を省略すると既定の3回まで再試行する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(503, {}));
    const sleep = vi.fn(async () => undefined);
    const notion = createNotionClient({ token: "secret_test", fetchFn, sleep });

    await expect(notion.archivePage("p")).rejects.toThrow(NotionApiError);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
});
