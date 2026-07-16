import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "./http";
import { reapStaleRows } from "./loopReaper";
import { queryAllDataSource } from "./notionRepository";

const NOW = 1_700_000_000_000;
const TIMEOUT = 15 * 60 * 1000;

function ok(json: unknown): HttpResponse {
  return { ok: true, status: 200, json: async () => json, text: async () => "" };
}

describe("reapStaleRows", () => {
  it("Notionの2ページ目（101件目）にあるstale行も失敗化コールバックへ渡す", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `fresh-${index}`,
      url: "",
      properties: {},
    }));
    const stalePage = { id: "stale-101", url: "", properties: {} };
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(ok({ results: firstPage, has_more: true, next_cursor: "page-2" }))
      .mockResolvedValueOnce(ok({ results: [stalePage], has_more: false, next_cursor: null }));
    const pages = await queryAllDataSource("ideas", {}, { token: "token", fetchFn });
    const rows = pages.map((page, index) => ({
      id: page.id,
      status: "処理中",
      requestedAtMs: index === 100 ? NOW - TIMEOUT - 1 : NOW - 1_000,
    }));
    const reaped: string[] = [];

    await reapStaleRows(rows, NOW, TIMEOUT, async (row) => {
      reaped.push(row.id);
    });

    expect(reaped).toEqual(["stale-101"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
