import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  makeRawColumnItem,
  makeRawColumnList,
  makeRawColumnCategory,
  makeRawColumnCategoryList,
} from "../../../__mocks__/columns-fixtures";

function fetchMock() {
  return global.fetch as ReturnType<typeof vi.fn>;
}

describe("columns queries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("MICROCMS_SERVICE_DOMAIN", "example");
    vi.stubEnv("MICROCMS_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("getColumnsList", () => {
    it("depth=1 と locale/orders/limit/offset を渡す", async () => {
      fetchMock().mockResolvedValue({
        ok: true,
        json: async () => makeRawColumnList([makeRawColumnItem()]),
      });
      const { getColumnsList } = await import("./columnsQueries");
      const r = await getColumnsList({ locale: "ja", limit: 12, offset: 0 });
      expect(r.contents).toHaveLength(1);
      const url = fetchMock().mock.calls[0][0] as string;
      const decoded = decodeURIComponent(url);
      expect(decoded).toContain("filters=locale[contains]ja");
      expect(decoded).toContain("orders=-publishedAt");
      expect(url).toContain("limit=12");
      expect(url).toContain("depth=1");
      expect(url).toContain("/columns");
    });

    it("category 指定で filters に category[equals]{id} を AND 付与する", async () => {
      fetchMock().mockResolvedValue({
        ok: true,
        json: async () => makeRawColumnList([]),
      });
      const { getColumnsList } = await import("./columnsQueries");
      await getColumnsList({
        locale: "ja",
        limit: 12,
        offset: 0,
        category: "rules",
      });
      const decoded = decodeURIComponent(
        fetchMock().mock.calls[0][0] as string,
      );
      expect(decoded).toContain(
        "filters=locale[contains]ja[and]category[equals]rules",
      );
    });
  });

  describe("getColumnDetail", () => {
    it("slug+locale で depth=1 の1件を取得", async () => {
      fetchMock().mockResolvedValue({
        ok: true,
        json: async () =>
          makeRawColumnList([makeRawColumnItem({ slug: "g" })]),
      });
      const { getColumnDetail } = await import("./columnsQueries");
      const r = await getColumnDetail({ locale: "ja", slug: "g" });
      expect(r?.slug).toBe("g");
      const url = fetchMock().mock.calls[0][0] as string;
      expect(url).toContain("depth=1");
      expect(url).not.toContain("draftKey=");
    });

    it("見つからないと null", async () => {
      fetchMock().mockResolvedValue({
        ok: true,
        json: async () => makeRawColumnList([]),
      });
      const { getColumnDetail } = await import("./columnsQueries");
      expect(
        await getColumnDetail({ locale: "ja", slug: "none" }),
      ).toBeNull();
    });
  });

  describe("getColumnByContentId", () => {
    it("単一GET /columns/{id}?draftKey=&depth=1 でドラフト取得", async () => {
      fetchMock().mockResolvedValue({
        ok: true,
        json: async () => makeRawColumnItem({ slug: "x" }),
      });
      const { getColumnByContentId } = await import("./columnsQueries");
      const r = await getColumnByContentId({ id: "c-abc", draftKey: "dk-1" });
      expect(r?.slug).toBe("x");
      const url = fetchMock().mock.calls[0][0] as string;
      expect(url).toContain("/columns/c-abc");
      expect(url).toContain("draftKey=dk-1");
      expect(url).toContain("depth=1");
    });

    it("404 で null", async () => {
      fetchMock().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });
      const { getColumnByContentId } = await import("./columnsQueries");
      expect(
        await getColumnByContentId({ id: "c-none", draftKey: "dk" }),
      ).toBeNull();
    });
  });

  describe("getColumnCategories", () => {
    it("order 昇順で全カテゴリを取得する", async () => {
      fetchMock().mockResolvedValue({
        ok: true,
        json: async () =>
          makeRawColumnCategoryList([
            makeRawColumnCategory({ id: "start", order: 1 }),
            makeRawColumnCategory({ id: "rules", order: 2 }),
          ]),
      });
      const { getColumnCategories } = await import("./columnsQueries");
      const r = await getColumnCategories();
      expect(r.map((c) => c.id)).toEqual(["start", "rules"]);
      const url = fetchMock().mock.calls[0][0] as string;
      expect(decodeURIComponent(url)).toContain("orders=order");
      expect(url).toContain("/column-categories");
    });
  });

  describe("getColumnSlugs", () => {
    it("offset 反復で 100 件超も全件取得する (news の頭打ちを踏襲しない)", async () => {
      // 1回目: ja 150 件 (limit 100 → 100 件返す), 2回目: ja 残り 50 件,
      // 3回目: en 0 件。offset を進めて totalCount まで反復することを検証する。
      const jaFirst = makeRawColumnList(
        Array.from({ length: 100 }, (_, i) =>
          makeRawColumnItem({ id: `ja${i}`, slug: `ja-${i}`, locale: "ja" }),
        ),
        150,
      );
      const jaSecond = {
        ...makeRawColumnList(
          Array.from({ length: 50 }, (_, i) =>
            makeRawColumnItem({
              id: `ja${100 + i}`,
              slug: `ja-${100 + i}`,
              locale: "ja",
            }),
          ),
          150,
        ),
        offset: 100,
      };
      const enEmpty = makeRawColumnList([], 0);

      fetchMock().mockImplementation(async (u: unknown) => {
        const decoded = decodeURIComponent(String(u));
        if (decoded.includes("locale[contains]ja")) {
          const call = fetchMock().mock.calls.length;
          return {
            ok: true,
            json: async () => (call === 1 ? jaFirst : jaSecond),
          };
        }
        return { ok: true, json: async () => enEmpty };
      });

      const { getColumnSlugs } = await import("./columnsQueries");
      const r = await getColumnSlugs();
      const jaSlugs = r.filter((s) => s.locale === "ja");
      expect(jaSlugs).toHaveLength(150);
      expect(jaSlugs[0].slug).toBe("ja-0");
      expect(jaSlugs[149].slug).toBe("ja-149");
    });

    it("両 locale の slug を返す", async () => {
      fetchMock().mockImplementation(async (u: unknown) => {
        const decoded = decodeURIComponent(String(u));
        if (decoded.includes("locale[contains]ja")) {
          return {
            ok: true,
            json: async () =>
              makeRawColumnList(
                [makeRawColumnItem({ slug: "a", locale: "ja" })],
                1,
              ),
          };
        }
        return {
          ok: true,
          json: async () =>
            makeRawColumnList(
              [makeRawColumnItem({ slug: "c", locale: "en" })],
              1,
            ),
        };
      });
      const { getColumnSlugs } = await import("./columnsQueries");
      const r = await getColumnSlugs();
      expect(r).toEqual([
        { locale: "ja", slug: "a" },
        { locale: "en", slug: "c" },
      ]);
    });
  });
});
