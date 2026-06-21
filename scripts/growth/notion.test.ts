// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "./http";
import {
  BODY_MIRROR_PROP,
  buildBodyMirrorProps,
  buildDraftLinkProps,
  chunkRichText,
  createPage,
  DEFAULT_NOTION_VERSION,
  DRAFT_LINK_PROPS,
  getLatestReport,
  getPage,
  queryDataSource,
  updatePageProps,
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

describe("updatePageProps", () => {
  it("複数プロパティを 1 PATCH で送り id を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ object: "page", id: "p9" }));

    const id = await updatePageProps(
      "p9",
      {
        "修正ステータス": { select: { name: "依頼中" } },
        "修正指示": { rich_text: [{ text: { content: "[]" } }] },
        "修正依頼時刻": { date: { start: "2026-06-19T00:00:00.000Z" } },
      },
      { token: TOKEN, fetchFn }
    );

    expect(id).toBe("p9");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.notion.com/v1/pages/p9");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      properties: {
        "修正ステータス": { select: { name: "依頼中" } },
        "修正指示": { rich_text: [{ text: { content: "[]" } }] },
        "修正依頼時刻": { date: { start: "2026-06-19T00:00:00.000Z" } },
      },
    });
  });

  it("応答に id が無ければ throw する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok({ object: "page" }));
    await expect(
      updatePageProps("p1", { "修正ステータス": { select: { name: "なし" } } }, { token: TOKEN, fetchFn })
    ).rejects.toThrow(/id が含まれていません/);
  });

  it("失敗時は throw する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(fail(400, "bad"));
    await expect(
      updatePageProps("p1", {}, { token: TOKEN, fetchFn })
    ).rejects.toThrow(/400/);
  });
});

describe("getPage", () => {
  it("GET /v1/pages/{id} を body なしで送り、ページを返す", async () => {
    const page = { id: "p1", url: "https://notion.so/p1", properties: { x: 1 } };
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(ok(page));

    const result = await getPage("p1", { token: TOKEN, fetchFn });

    expect(result).toEqual(page);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.notion.com/v1/pages/p1");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("失敗時は throw する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(fail(404, "no page"));
    await expect(getPage("p1", { token: TOKEN, fetchFn })).rejects.toThrow(/404/);
  });
});

describe("buildDraftLinkProps（下書きリンク #73）", () => {
  it("contentId と draftKey の両方を rich_text プロパティにする", () => {
    expect(buildDraftLinkProps("g-abc", "dk-1")).toEqual({
      [DRAFT_LINK_PROPS.contentId]: { rich_text: [{ text: { content: "g-abc" } }] },
      [DRAFT_LINK_PROPS.draftKey]: { rich_text: [{ text: { content: "dk-1" } }] },
    });
  });

  it("draftKey が null なら contentId だけ書き込む(取得失敗でも止めない)", () => {
    expect(buildDraftLinkProps("g-abc", null)).toEqual({
      [DRAFT_LINK_PROPS.contentId]: { rich_text: [{ text: { content: "g-abc" } }] },
    });
  });

  it("draftKey が空文字でも書き込まない", () => {
    expect(buildDraftLinkProps("g-abc", "")).toEqual({
      [DRAFT_LINK_PROPS.contentId]: { rich_text: [{ text: { content: "g-abc" } }] },
    });
  });
});

describe("buildBodyMirrorProps（本文ミラー #95）", () => {
  it("本文HTMLを下書き本文HTMLプロパティへ rich_text で書き込む", () => {
    expect(buildBodyMirrorProps("<p>本文</p>")).toEqual({
      [BODY_MIRROR_PROP]: { rich_text: [{ text: { content: "<p>本文</p>" } }] },
    });
  });

  it("2000字超は分割される", () => {
    const long = "x".repeat(2500);
    const props = buildBodyMirrorProps(long) as Record<
      string,
      { rich_text: Array<{ text: { content: string } }> }
    >;
    expect(props[BODY_MIRROR_PROP].rich_text).toHaveLength(2);
  });

  it("空文字は空配列(プロパティを空にする)", () => {
    expect(buildBodyMirrorProps("")).toEqual({
      [BODY_MIRROR_PROP]: { rich_text: [] },
    });
  });
});

describe("chunkRichText", () => {
  it("空文字は空配列(プロパティを空にする)", () => {
    expect(chunkRichText("")).toEqual([]);
  });

  it("2000文字以内は 1 要素", () => {
    expect(chunkRichText("あいう")).toEqual([{ text: { content: "あいう" } }]);
    const exact = "x".repeat(2000);
    expect(chunkRichText(exact)).toEqual([{ text: { content: exact } }]);
  });

  it("2000文字を超えると 2000 文字ごとに分割", () => {
    const text = "x".repeat(2001);
    const items = chunkRichText(text);
    expect(items).toHaveLength(2);
    expect(items[0].text.content).toHaveLength(2000);
    expect(items[1].text.content).toBe("x");
  });

  it("100要素(20万字)を超えると throw する", () => {
    expect(() => chunkRichText("x".repeat(2000 * 100 + 1))).toThrow(/長すぎます/);
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
