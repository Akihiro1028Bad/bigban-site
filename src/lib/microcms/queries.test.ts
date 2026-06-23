import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  makeNewsItem,
  makeNewsList,
} from "../../../__mocks__/microcms-fixtures";

describe("queries", () => {
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

  describe("getNewsList", () => {
    it("locale/orders/limit/offset を渡す", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => makeNewsList([makeNewsItem()]),
      });
      const { getNewsList } = await import("./queries");
      const r = await getNewsList({ locale: "ja", limit: 12, offset: 0 });
      expect(r.contents).toHaveLength(1);
      const url = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(decodeURIComponent(url)).toContain("filters=locale[contains]ja");
      expect(decodeURIComponent(url)).toContain("orders=-publishedAt");
      expect(url).toContain("limit=12");
    });

    it("category 指定で filters AND (microCMS 側は日本語ラベルで保存されているため日本語で送る)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => makeNewsList([]),
      });
      const { getNewsList } = await import("./queries");
      await getNewsList({
        locale: "ja",
        limit: 12,
        offset: 0,
        category: "media",
      });
      const url = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(decodeURIComponent(url)).toContain(
        "filters=locale[contains]ja[and]category[contains]メディア掲載",
      );
    });
  });

  describe("getNewsDetail", () => {
    it("1件取得", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => makeNewsList([makeNewsItem({ slug: "g" })]),
      });
      const { getNewsDetail } = await import("./queries");
      const r = await getNewsDetail({ locale: "ja", slug: "g" });
      expect(r?.slug).toBe("g");
    });

    it("見つからないとnull", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => makeNewsList([]),
      });
      const { getNewsDetail } = await import("./queries");
      expect(
        await getNewsDetail({ locale: "ja", slug: "none" }),
      ).toBeNull();
    });

    it("getNewsDetail は LIST 経路のみ (公開版)、draftKey は付与しない (プレビューは別関数)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => makeNewsList([makeNewsItem({ slug: "x" })]),
      });
      const { getNewsDetail } = await import("./queries");
      await getNewsDetail({ locale: "ja", slug: "x" });
      const url = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(url).toContain("filters=");
      expect(url).not.toContain("draftKey=");
    });
  });

  describe("getNewsByContentId", () => {
    it("単一GET /news/{id}?draftKey= でドラフト取得", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => makeNewsItem({ slug: "x" }),
      });
      const { getNewsByContentId } = await import("./queries");
      const r = await getNewsByContentId({ id: "g-abc", draftKey: "dk-1" });
      expect(r?.slug).toBe("x");
      const url = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(url).toContain("/news/g-abc");
      expect(url).toContain("draftKey=dk-1");
    });

    it("404 エラー時は null", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });
      const { getNewsByContentId } = await import("./queries");
      expect(
        await getNewsByContentId({ id: "g-none", draftKey: "dk" }),
      ).toBeNull();
    });
  });

  describe("warnIfDraftLeak (防御ロギング)", () => {
    it("updatedAt > revisedAt の時は console.warn を出す", async () => {
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () =>
          makeNewsList([
            makeNewsItem({
              id: "leak-1",
              slug: "leak-slug",
              publishedAt: "2026-01-01T00:00:00.000Z",
              revisedAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-02-01T00:00:00.000Z",
            }),
          ]),
      });
      const { getNewsList } = await import("./queries");
      await getNewsList({ locale: "ja", limit: 12, offset: 0 });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("possible draft leak detected"),
      );
      warnSpy.mockRestore();
    });

    it("revisedAt が無い (未公開) 時は warn しない", async () => {
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () =>
          makeNewsList([
            makeNewsItem({ id: "no-leak", revisedAt: undefined }),
          ]),
      });
      const { getNewsList } = await import("./queries");
      await getNewsList({ locale: "ja", limit: 12, offset: 0 });
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("getNewsSlugs", () => {
    it("totalCount が limit を超える時は warn を出す", async () => {
      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          contents: [makeNewsItem({ slug: "a" })],
          totalCount: 200, // limit (100) を超過
          offset: 0,
          limit: 100,
        }),
      });
      const { getNewsSlugs } = await import("./queries");
      await getNewsSlugs();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("exceeds limit"),
      );
      warnSpy.mockRestore();
    });

    it("全 locale の slug を返す", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        async (u: unknown) => {
          const url = String(u);
          if (decodeURIComponent(url).includes("locale[contains]ja")) {
            return {
              ok: true,
              json: async () =>
                makeNewsList([
                  makeNewsItem({ slug: "a", locale: "ja" }),
                  makeNewsItem({ slug: "b", locale: "ja" }),
                ]),
            };
          }
          return {
            ok: true,
            json: async () =>
              makeNewsList([makeNewsItem({ slug: "c", locale: "en" })]),
          };
        },
      );
      const { getNewsSlugs } = await import("./queries");
      const r = await getNewsSlugs();
      expect(r).toEqual([
        { locale: "ja", slug: "a", updatedAt: "2026-04-01T00:00:00.000Z" },
        { locale: "ja", slug: "b", updatedAt: "2026-04-01T00:00:00.000Z" },
        { locale: "en", slug: "c", updatedAt: "2026-04-01T00:00:00.000Z" },
      ]);
    });
  });
});
