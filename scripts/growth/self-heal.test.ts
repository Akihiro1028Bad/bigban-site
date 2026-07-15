// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import {
  selectDuplicateIds,
  selfHeal,
  cleanThenRetry,
  listDraftMetas,
  fetchContentSlug,
  deleteContent,
  type DraftMeta,
  type SelfHealDeps,
} from "./self-heal";
import { ExternalApiError } from "./externalApiError";
import type { FetchFn } from "./http";

describe("selectDuplicateIds", () => {
  const candidates = [
    { id: "canonical", slug: "roadmap" },
    { id: "rnd1", slug: "roadmap" },
    { id: "rnd2", slug: "roadmap" },
    { id: "other", slug: "different" },
    { id: "noslug", slug: null },
  ];

  it("同slugかつ正本以外のidを返す", () => {
    expect(
      selectDuplicateIds({ candidates, slug: "roadmap", canonicalId: "canonical" })
    ).toEqual(["rnd1", "rnd2"]);
  });

  it("正本は決して含めない", () => {
    const ids = selectDuplicateIds({ candidates, slug: "roadmap", canonicalId: "canonical" });
    expect(ids).not.toContain("canonical");
  });

  it("該当なしなら空配列", () => {
    expect(
      selectDuplicateIds({ candidates: [], slug: "x", canonicalId: "c" })
    ).toEqual([]);
  });
});

describe("listDraftMetas", () => {
  const opts = (fetchFn: FetchFn) => ({
    serviceDomain: "thepicklebang",
    apiKey: "mgmt",
    fetchFn,
  });

  it("管理APIから DRAFT のみの {id, draftKey} を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        contents: [
          { id: "a", status: ["DRAFT"], draftKey: "ka" },
          { id: "b", status: ["PUBLISH"], draftKey: null },
          { id: "c", status: ["DRAFT"], draftKey: "kc" },
        ],
        totalCount: 3,
      }),
      text: async () => "",
    });
    const r = await listDraftMetas("news", opts(fetchFn));
    expect(r.items).toEqual([
      { id: "a", draftKey: "ka" },
      { id: "c", draftKey: "kc" },
    ]);
    expect(r.totalCount).toBe(3);
    const [url] = fetchFn.mock.calls[0];
    expect(url).toContain("thepicklebang.microcms-management.io/api/v1/contents/news");
  });

  it("draftKey欠落・id欠落・status非配列・totalCount欠落を頑健に扱う", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        contents: [
          { id: "d", status: ["DRAFT"] }, // draftKey 欠落 → null
          { status: ["DRAFT"], draftKey: "x" }, // id 欠落 → 除外
          { id: "e" }, // status 非配列 → 除外
        ],
        // totalCount 欠落 → items.length にフォールバック
      }),
      text: async () => "",
    });
    const r = await listDraftMetas("news", opts(fetchFn));
    expect(r.items).toEqual([{ id: "d", draftKey: null }]);
    expect(r.totalCount).toBe(1);
  });

  it("HTTPエラーは本文を含めず構造化例外にする", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "err",
    });
    const error = await listDraftMetas("news", opts(fetchFn)).catch(
      (reason: unknown) => reason
    );
    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ operation: "microcms.drafts.list", status: 500 });
    expect((error as Error).message).not.toContain("err");
  });

  it("contents 欠落でも空配列を返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    });
    const r = await listDraftMetas("news", opts(fetchFn));
    expect(r.items).toEqual([]);
    expect(r.totalCount).toBe(0);
  });
});

describe("fetchContentSlug", () => {
  const opts = (fetchFn: FetchFn) => ({
    serviceDomain: "thepicklebang",
    apiKey: "k",
    fetchFn,
  });

  it("draftKey 付きで slug を取得", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ slug: "roadmap" }),
      text: async () => "",
    });
    const slug = await fetchContentSlug("news", "a", "ka", opts(fetchFn));
    expect(slug).toBe("roadmap");
    const [url] = fetchFn.mock.calls[0];
    expect(url).toContain("/api/v1/news/a");
    expect(url).toContain("draftKey=ka");
  });

  it("slug 欠落は null", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    });
    expect(await fetchContentSlug("news", "a", null, opts(fetchFn))).toBeNull();
  });

  it("HTTPエラーは本文を含めず構造化例外にする", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "nf",
    });
    const error = await fetchContentSlug("news", "a", null, opts(fetchFn)).catch(
      (reason: unknown) => reason
    );
    expect(error).toMatchObject({ operation: "microcms.content.slug.get", status: 404 });
    expect((error as Error).message).not.toContain("nf");
  });
});

describe("deleteContent", () => {
  const opts = (fetchFn: FetchFn) => ({
    serviceDomain: "thepicklebang",
    apiKey: "k",
    fetchFn,
  });

  it("DELETE を送る（202で成功）", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({}),
      text: async () => "Accepted",
    });
    await deleteContent("news", "rnd1", opts(fetchFn));
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("/api/v1/news/rnd1");
    expect(init.method).toBe("DELETE");
  });

  it("HTTPエラーは本文を含めず構造化例外にする", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => "forbidden",
    });
    const error = await deleteContent("news", "rnd1", opts(fetchFn)).catch(
      (reason: unknown) => reason
    );
    expect(error).toMatchObject({ operation: "microcms.content.delete", status: 403 });
    expect((error as Error).message).not.toContain("forbidden");
  });
});

describe("selfHeal（orchestration・DI）", () => {
  const metas: DraftMeta[] = [
    { id: "roadmap", draftKey: "k0" },
    { id: "rnd1", draftKey: "k1" },
    { id: "rnd2", draftKey: "k2" },
  ];
  const slugs: Record<string, string> = {
    roadmap: "roadmap",
    rnd1: "roadmap",
    rnd2: "roadmap",
  };

  function deps(overrides: Partial<SelfHealDeps> = {}): SelfHealDeps {
    return {
      listMetas: vi.fn(async () => ({ items: metas, totalCount: metas.length })),
      resolveSlug: vi.fn(async (id: string) => slugs[id] ?? null),
      del: vi.fn(async () => {}),
      ...overrides,
    };
  }

  it("dry-run（既定）では削除対象を返すが削除はしない", async () => {
    const d = deps();
    const r = await selfHeal(
      { slug: "roadmap", canonicalId: "roadmap", dryRun: true, maxDelete: 100 },
      d
    );
    expect(r.enumerated).toBe(true);
    expect(r.duplicateIds).toEqual(["rnd1", "rnd2"]);
    expect(r.deletedIds).toEqual([]);
    expect(d.del).not.toHaveBeenCalled();
  });

  it("apply（dryRun=false）で正本以外を削除する", async () => {
    const d = deps();
    const r = await selfHeal(
      { slug: "roadmap", canonicalId: "roadmap", dryRun: false, maxDelete: 100 },
      d
    );
    expect(r.deletedIds).toEqual(["rnd1", "rnd2"]);
    expect(d.del).toHaveBeenCalledTimes(2);
    expect(d.del).not.toHaveBeenCalledWith("roadmap");
  });

  it("maxDelete の上限を超えて削除しない", async () => {
    const d = deps();
    const r = await selfHeal(
      { slug: "roadmap", canonicalId: "roadmap", dryRun: false, maxDelete: 1 },
      d
    );
    expect(r.deletedIds).toEqual(["rnd1"]);
    expect(r.truncated).toBe(true);
  });

  it("列挙できない（listMetas が throw）ときは沈黙せずフォールバックを返す", async () => {
    const d = deps({
      listMetas: vi.fn(async () => {
        throw new Error("enumeration unavailable");
      }),
    });
    const r = await selfHeal(
      { slug: "roadmap", canonicalId: "roadmap", dryRun: false, maxDelete: 100 },
      d
    );
    expect(r.enumerated).toBe(false);
    expect(r.deletedIds).toEqual([]);
    expect(r.message).toMatch(/手動|確認/);
  });

  it("列挙が非Error値で失敗してもフォールバックする", async () => {
    const d = deps({
      listMetas: vi.fn(async () => {
        throw "boom"; // 非Error
      }),
    });
    const r = await selfHeal(
      { slug: "roadmap", canonicalId: "roadmap", dryRun: false, maxDelete: 100 },
      d
    );
    expect(r.enumerated).toBe(false);
    expect(r.message).toContain("boom");
  });

  it("一覧が totalCount より少ない（ページ打ち切り）と truncated を立てる", async () => {
    const d = deps({
      listMetas: vi.fn(async () => ({ items: metas, totalCount: 999 })),
    });
    const r = await selfHeal(
      { slug: "roadmap", canonicalId: "roadmap", dryRun: true, maxDelete: 100 },
      d
    );
    expect(r.truncated).toBe(true);
  });
});

describe("cleanThenRetry", () => {
  it("掃除を1回 → 再投入を1回行い、再投入結果を返す", async () => {
    const heal = vi.fn(async () => ({
      enumerated: true,
      truncated: false,
      duplicateIds: ["rnd1"],
      deletedIds: ["rnd1"],
      message: "1件削除",
    }));
    const retry = vi.fn(async () => "new-id");
    const id = await cleanThenRetry({ heal, retry });
    expect(id).toBe("new-id");
    expect(heal).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
