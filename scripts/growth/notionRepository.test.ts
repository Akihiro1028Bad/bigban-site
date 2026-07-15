// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "./http";
import type { NotionPage } from "./notion";
import {
  getLatestReport,
  NOTION_MAX_ATTEMPTS,
  NOTION_MAX_ITEMS,
  NOTION_MAX_PAGES,
  queryAllDataSource,
  queryFirstDataSource,
} from "./notionRepository";

const page = (id: string): NotionPage => ({ id, url: `https://notion.so/${id}`, properties: {} });
const ok = (value: unknown): HttpResponse => ({ ok: true, status: 200, json: async () => value, text: async () => "" });
const fail = (status: number, body: string, retryAfter: string | null = null): HttpResponse => ({
  ok: false,
  status,
  headers: { get: () => retryAfter },
  json: async () => ({}),
  text: async () => body,
});
const options = (fetchFn: FetchFn) => ({ token: "token", fetchFn });
const bodyOf = (fetchFn: ReturnType<typeof vi.fn<FetchFn>>, index: number): Record<string, unknown> =>
  JSON.parse(fetchFn.mock.calls[index][1].body as string) as Record<string, unknown>;

describe("queryAllDataSource", () => {
  it.each([101, 201])("%i件を順序どおり全ページから返す", async (count) => {
    const fetchFn = vi.fn<FetchFn>(async (_url, init) => {
      const body = JSON.parse(init.body as string) as { start_cursor?: string };
      const offset = body.start_cursor ? Number(body.start_cursor) : 0;
      const results = Array.from({ length: Math.min(100, count - offset) }, (_, index) => page(String(offset + index)));
      const next = offset + results.length;
      return ok({ results, has_more: next < count, next_cursor: next < count ? String(next) : null });
    });
    const pages = await queryAllDataSource("ds", { filter: { x: 1 } }, options(fetchFn));
    expect(pages.map(({ id }) => id)).toEqual(Array.from({ length: count }, (_, index) => String(index)));
    expect(bodyOf(fetchFn, 0)).toEqual({ filter: { x: 1 }, page_size: 100 });
    expect(bodyOf(fetchFn, 1).start_cursor).toBe("100");
  });

  it("next_cursor欠落を明示的に拒否する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ results: [page("1")], has_more: true, next_cursor: null }));
    await expect(queryAllDataSource("ds", {}, options(fetchFn))).rejects.toThrow("next_cursor");
  });

  it("使用済みカーソルの再登場を拒否する", async () => {
    const fetchFn = vi.fn<FetchFn>()
      .mockResolvedValueOnce(ok({ results: [], has_more: true, next_cursor: "same" }))
      .mockResolvedValueOnce(ok({ results: [], has_more: true, next_cursor: "same" }));
    await expect(queryAllDataSource("ds", {}, options(fetchFn))).rejects.toThrow("使用済みカーソル");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("最大ページ数でhas_moreなら部分結果を返さない", async () => {
    let cursor = 0;
    const fetchFn = vi.fn<FetchFn>().mockImplementation(async () => ok({ results: [], has_more: true, next_cursor: String(++cursor) }));
    await expect(queryAllDataSource("ds", {}, options(fetchFn))).rejects.toThrow(`${NOTION_MAX_PAGES}`);
  });

  it("最大件数超過を拒否し、上限ちょうどは返す", async () => {
    const tooMany = vi.fn<FetchFn>().mockResolvedValue(ok({ results: Array.from({ length: NOTION_MAX_ITEMS + 1 }, (_, i) => page(String(i))), has_more: false }));
    await expect(queryAllDataSource("ds", {}, options(tooMany))).rejects.toThrow(`${NOTION_MAX_ITEMS}`);
    let offset = 0;
    const exact = vi.fn<FetchFn>().mockImplementation(async () => {
      const results = Array.from({ length: 100 }, (_, i) => page(String(offset + i)));
      offset += 100;
      return ok({ results, has_more: offset < NOTION_MAX_ITEMS, next_cursor: offset < NOTION_MAX_ITEMS ? String(offset) : null });
    });
    await expect(queryAllDataSource("ds", {}, options(exact))).resolves.toHaveLength(NOTION_MAX_ITEMS);
  });

  it.each([[429, "2", 2000], [500, null, 500], [503, null, 500]])("2ページ目のHTTP %iを同じカーソルで再試行する", async (status, retryAfter, delay) => {
    const sleepFn = vi.fn(async (_delayMs: number) => {});
    const fetchFn = vi.fn<FetchFn>()
      .mockResolvedValueOnce(ok({ results: [page("first")], has_more: true, next_cursor: "cursor" }))
      .mockResolvedValueOnce(fail(status as number, "temporary", retryAfter as string | null))
      .mockResolvedValueOnce(ok({ results: [page("second")], has_more: false }));
    const pages = await queryAllDataSource("ds", {}, options(fetchFn), { sleepFn });
    expect(pages.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(bodyOf(fetchFn, 1)).toEqual(bodyOf(fetchFn, 2));
    expect(sleepFn).toHaveBeenCalledWith(delay);
  });

  it("5xxを指数バックオフし最大試行回数で最後のエラーを投げる", async () => {
    const sleepFn = vi.fn(async (_delayMs: number) => {});
    const fetchFn = vi.fn<FetchFn>()
      .mockResolvedValueOnce(fail(500, "one"))
      .mockResolvedValueOnce(fail(503, "two"))
      .mockResolvedValueOnce(fail(500, "three"))
      .mockResolvedValueOnce(fail(503, "last"));
    await expect(queryAllDataSource("ds", {}, options(fetchFn), { sleepFn })).rejects.toThrow("last");
    expect(fetchFn).toHaveBeenCalledTimes(NOTION_MAX_ATTEMPTS);
    expect(sleepFn.mock.calls.map(([delay]) => delay)).toEqual([500, 1000, 2000]);
  });

  it("400は再試行せず、fetch失敗は同じカーソルで再試行する", async () => {
    const sleepFn = vi.fn(async (_delayMs: number) => {});
    const badRequest = vi.fn<FetchFn>().mockResolvedValue(fail(400, "bad"));
    await expect(queryAllDataSource("ds", {}, options(badRequest), { sleepFn })).rejects.toThrow("400");
    expect(badRequest).toHaveBeenCalledTimes(1);
    const transient = vi.fn<FetchFn>().mockRejectedValueOnce(new TypeError("network")).mockResolvedValueOnce(ok({ results: [] }));
    await expect(queryAllDataSource("ds", {}, options(transient), { sleepFn })).resolves.toEqual([]);
    expect(bodyOf(transient, 0)).toEqual(bodyOf(transient, 1));
  });

  it("Retry-Afterを30秒に制限する", async () => {
    const sleepFn = vi.fn(async (_delayMs: number) => {});
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(fail(429, "wait", "99")).mockResolvedValueOnce(ok({ results: [] }));
    await queryAllDataSource("ds", {}, options(fetchFn), { sleepFn });
    expect(sleepFn).toHaveBeenCalledWith(30_000);
  });
});

describe("先頭1件reader", () => {
  it("queryFirstDataSourceはpage_size=1で一度だけ取得する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ results: [page("one")], has_more: true, next_cursor: "unused" }));
    await expect(queryFirstDataSource("ds", { filter: { x: 1 } }, options(fetchFn))).resolves.toEqual(page("one"));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchFn, 0)).toEqual({ filter: { x: 1 }, page_size: 1 });
  });

  it("getLatestReportは作成日時降順の先頭を返し、空ならnull", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(ok({ results: [page("latest")] })).mockResolvedValueOnce(ok({ results: [] }));
    await expect(getLatestReport("ds", options(fetchFn))).resolves.toEqual(page("latest"));
    expect(bodyOf(fetchFn, 0)).toEqual({ sorts: [{ timestamp: "created_time", direction: "descending" }], page_size: 1 });
    await expect(getLatestReport("ds", options(fetchFn))).resolves.toBeNull();
  });
});
