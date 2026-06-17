// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "./http";
import {
  createPage,
  DEFAULT_NOTION_VERSION,
  getLatestReport,
  queryDataSource,
  updatePageSelect,
} from "./notion";

function ok(json: unknown): HttpResponse {
  return {
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => "",
  };
}

function fail(status: number, text: string): HttpResponse {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text,
  };
}

const TOKEN = "secret_test";
const DS = "27d6794f-4133-4cd4-9407-491d95c1b82b";

describe("queryDataSource", () => {
  it("POST /v1/data_sources/{id}/query を既定バージョンで叩き pages を返す", async () => {
    const page = { id: "p1", url: "https://notion.so/p1", properties: {} };
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(
      ok({ results: [page], has_more: true, next_cursor: "cur1" })
    );

    const result = await queryDataSource(
      DS,
      { filter: { property: "x" }, sorts: [{ property: "y", direction: "ascending" }], pageSize: 5, startCursor: "c0" },
      { token: TOKEN, fetchFn }
    );

    expect(result).toEqual({ pages: [page], hasMore: true, nextCursor: "cur1" });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`https://api.notion.com/v1/data_sources/${DS}/query`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["Notion-Version"]).toBe(DEFAULT_NOTION_VERSION);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      filter: { property: "x" },
      sorts: [{ property: "y", direction: "ascending" }],
      page_size: 5,
      start_cursor: "c0",
    });
  });

  it("空ボディと欠落フィールドに既定値を補う", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({}));

    const result = await queryDataSource(DS, {}, { token: TOKEN, fetchFn });

    expect(result).toEqual({ pages: [], hasMore: false, nextCursor: null });
    const [, init] = fetchFn.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("version を上書きできる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ results: [] }));

    await queryDataSource(DS, {}, { token: TOKEN, fetchFn, version: "2022-06-28" });

    const [, init] = fetchFn.mock.calls[0];
    expect((init.headers as Record<string, string>)["Notion-Version"]).toBe("2022-06-28");
  });

  it("失敗時は HTTP ステータス付きで throw する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(fail(401, "unauthorized"));

    await expect(
      queryDataSource(DS, {}, { token: TOKEN, fetchFn })
    ).rejects.toThrow(/401.*unauthorized/);
  });
});

describe("updatePageSelect", () => {
  it("PATCH /v1/pages/{id} に select プロパティを送り id を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ object: "page", id: "p1" }));

    const id = await updatePageSelect("p1", "ステータス", "承認", { token: TOKEN, fetchFn });

    expect(id).toBe("p1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.notion.com/v1/pages/p1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      properties: { "ステータス": { select: { name: "承認" } } },
    });
  });

  it("応答に id が無ければ throw する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ object: "page" }));

    await expect(
      updatePageSelect("p1", "ステータス", "却下", { token: TOKEN, fetchFn })
    ).rejects.toThrow(/id が含まれていません/);
  });

  it("失敗時は throw する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(fail(404, "not found"));

    await expect(
      updatePageSelect("p1", "ステータス", "承認", { token: TOKEN, fetchFn })
    ).rejects.toThrow(/404/);
  });
});

describe("createPage", () => {
  it("POST /v1/pages に data_source 親とプロパティを送り id を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ object: "page", id: "new1" }));

    const id = await createPage(
      DS,
      { "施策名": { title: [{ text: { content: "A" } }] } },
      { token: TOKEN, fetchFn }
    );

    expect(id).toBe("new1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.notion.com/v1/pages");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      parent: { type: "data_source_id", data_source_id: DS },
      properties: { "施策名": { title: [{ text: { content: "A" } }] } },
    });
  });

  it("応答に id が無ければ throw する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ object: "page" }));
    await expect(
      createPage(DS, {}, { token: TOKEN, fetchFn })
    ).rejects.toThrow(/id が含まれていません/);
  });

  it("失敗時は throw する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(fail(400, "bad request"));
    await expect(createPage(DS, {}, { token: TOKEN, fetchFn })).rejects.toThrow(/400/);
  });
});

describe("getLatestReport", () => {
  it("作成日降順で1件取得し先頭ページを返す", async () => {
    const page = { id: "r1", url: "https://notion.so/r1", properties: {} };
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ results: [page], has_more: false }));

    const result = await getLatestReport(DS, { token: TOKEN, fetchFn });

    expect(result).toEqual(page);
    const [, init] = fetchFn.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 1,
    });
  });

  it("結果が空なら null を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ results: [] }));

    const result = await getLatestReport(DS, { token: TOKEN, fetchFn });

    expect(result).toBeNull();
  });
});
