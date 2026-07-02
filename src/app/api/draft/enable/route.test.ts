import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const getNewsDetailMock = vi.fn();
const getNewsByContentIdMock = vi.fn();
const getColumnDetailMock = vi.fn();
const getColumnByContentIdMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/microcms/queries", () => ({
  getNewsDetail: (args: unknown) => getNewsDetailMock(args),
  getNewsByContentId: (args: unknown) => getNewsByContentIdMock(args),
}));
vi.mock("@/lib/microcms/columnsQueries", () => ({
  getColumnDetail: (args: unknown) => getColumnDetailMock(args),
  getColumnByContentId: (args: unknown) => getColumnByContentIdMock(args),
}));

function makeReq(url: string) {
  return new Request(url);
}

describe("/api/draft/enable GET", () => {
  beforeEach(() => {
    getNewsDetailMock.mockReset();
    getNewsByContentIdMock.mockReset();
    getColumnDetailMock.mockReset();
    getColumnByContentIdMock.mockReset();
    redirectMock.mockClear();
    vi.stubEnv("MICROCMS_DRAFT_SECRET", "ds3cret");
    vi.stubEnv("MICROCMS_DRAFT_ALLOWED_ORIGINS", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("secret不一致401", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      makeReq(
        "http://localhost/api/draft/enable?secret=bad&slug=a&draftKey=d",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("draftKey欠落401", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      makeReq("http://localhost/api/draft/enable?secret=ds3cret&slug=a"),
    );
    expect(res.status).toBe(401);
  });

  it("不正locale401", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      makeReq(
        "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=d&locale=xx",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("不正slug形式401 (大文字)", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      makeReq(
        "http://localhost/api/draft/enable?secret=ds3cret&slug=Bad-Slug&draftKey=d",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("slug存在しない401", async () => {
    getNewsDetailMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(
      makeReq(
        "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=d",
      ),
    );
    expect(res.status).toBe(401);
  });

  it("正常系 (slug+locale): /news/{slug}?draftKey=&contentId= に redirect", async () => {
    getNewsDetailMock.mockResolvedValue({ slug: "a", id: "g-id-a" });
    const { GET } = await import("./route");
    await expect(
      GET(
        makeReq(
          "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=dk&locale=ja",
        ),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledWith(
      "/news/a?draftKey=dk&contentId=g-id-a",
    );
  });

  it("locale=enはprefix付きパスへredirect", async () => {
    getNewsDetailMock.mockResolvedValue({ slug: "a", id: "g-id-a" });
    const { GET } = await import("./route");
    await expect(
      GET(
        makeReq(
          "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=dk&locale=en",
        ),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledWith(
      "/en/news/a?draftKey=dk&contentId=g-id-a",
    );
  });

  it("locale未指定はja", async () => {
    getNewsDetailMock.mockResolvedValue({ slug: "a", id: "g-id-a" });
    const { GET } = await import("./route");
    await expect(
      GET(
        makeReq(
          "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=dk",
        ),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledWith(
      "/news/a?draftKey=dk&contentId=g-id-a",
    );
  });

  it("MICROCMS_DRAFT_ALLOWED_ORIGINS 設定時、Origin不一致で401", async () => {
    vi.stubEnv("MICROCMS_DRAFT_ALLOWED_ORIGINS", "https://app.microcms.io");
    const req = new Request(
      "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=dk",
      { headers: { Origin: "https://evil.example.com" } },
    );
    const { GET } = await import("./route");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("MICROCMS_DRAFT_ALLOWED_ORIGINS 設定時、Origin ヘッダ欠落で401", async () => {
    vi.stubEnv("MICROCMS_DRAFT_ALLOWED_ORIGINS", "https://app.microcms.io");
    const req = new Request(
      "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=dk",
    );
    const { GET } = await import("./route");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("slug クエリ欠落 (contentId も無し) で401", async () => {
    const req = new Request(
      "http://localhost/api/draft/enable?secret=ds3cret&draftKey=dk",
    );
    const { GET } = await import("./route");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  describe("contentId 経由 (microCMS 画面プレビュー)", () => {
    it("正常系: contentId から slug/locale 逆引き → /news/{slug}?draftKey=&contentId= に redirect", async () => {
      getNewsByContentIdMock.mockResolvedValue({
        slug: "grand-opening-campaign",
        locale: "ja",
      });
      const { GET } = await import("./route");
      await expect(
        GET(
          makeReq(
            "http://localhost/api/draft/enable?secret=ds3cret&contentId=g-bj1ezru&draftKey=dk",
          ),
        ),
      ).rejects.toThrow(/NEXT_REDIRECT/);
      expect(getNewsByContentIdMock).toHaveBeenCalledWith({
        id: "g-bj1ezru",
        draftKey: "dk",
      });
      expect(redirectMock).toHaveBeenCalledWith(
        "/news/grand-opening-campaign?draftKey=dk&contentId=g-bj1ezru",
      );
    });

    it("locale=en の record は /en/news/... に redirect", async () => {
      getNewsByContentIdMock.mockResolvedValue({
        slug: "x",
        locale: "en",
      });
      const { GET } = await import("./route");
      await expect(
        GET(
          makeReq(
            "http://localhost/api/draft/enable?secret=ds3cret&contentId=g-abc&draftKey=dk",
          ),
        ),
      ).rejects.toThrow(/NEXT_REDIRECT/);
      expect(redirectMock).toHaveBeenCalledWith(
        "/en/news/x?draftKey=dk&contentId=g-abc",
      );
    });

    it("contentId 不正形式で401 (テンプレート文字列残存)", async () => {
      const { GET } = await import("./route");
      const res = await GET(
        makeReq(
          "http://localhost/api/draft/enable?secret=ds3cret&contentId={CONTENT_ID}&draftKey=dk",
        ),
      );
      expect(res.status).toBe(401);
      expect(getNewsByContentIdMock).not.toHaveBeenCalled();
    });

    it("contentId 該当無し (microCMS 404) で401", async () => {
      getNewsByContentIdMock.mockResolvedValue(null);
      const { GET } = await import("./route");
      const res = await GET(
        makeReq(
          "http://localhost/api/draft/enable?secret=ds3cret&contentId=g-none&draftKey=dk",
        ),
      );
      expect(res.status).toBe(401);
    });

    it("contentId 経路でも secret 不一致は401", async () => {
      const { GET } = await import("./route");
      const res = await GET(
        makeReq(
          "http://localhost/api/draft/enable?secret=bad&contentId=g-abc&draftKey=dk",
        ),
      );
      expect(res.status).toBe(401);
      expect(getNewsByContentIdMock).not.toHaveBeenCalled();
    });

    it("contentId 経路で draftKey 欠落は401", async () => {
      const { GET } = await import("./route");
      const res = await GET(
        makeReq(
          "http://localhost/api/draft/enable?secret=ds3cret&contentId=g-abc",
        ),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("endpoint=columns (コラムプレビュー出し分け)", () => {
    it("endpoint 未指定は news (後方互換): getNewsDetail を使う", async () => {
      getNewsDetailMock.mockResolvedValue({ slug: "a", id: "n-1" });
      const { GET } = await import("./route");
      await expect(
        GET(
          makeReq(
            "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=dk&locale=ja",
          ),
        ),
      ).rejects.toThrow(/NEXT_REDIRECT/);
      expect(getNewsDetailMock).toHaveBeenCalled();
      expect(getColumnDetailMock).not.toHaveBeenCalled();
      expect(redirectMock).toHaveBeenCalledWith(
        "/news/a?draftKey=dk&contentId=n-1",
      );
    });

    it("endpoint=columns (slug+locale): /columns/{slug} へ redirect し getColumnDetail を使う", async () => {
      getColumnDetailMock.mockResolvedValue({ slug: "a", id: "c-1" });
      const { GET } = await import("./route");
      await expect(
        GET(
          makeReq(
            "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=dk&locale=ja&endpoint=columns",
          ),
        ),
      ).rejects.toThrow(/NEXT_REDIRECT/);
      expect(getColumnDetailMock).toHaveBeenCalledWith({
        locale: "ja",
        slug: "a",
      });
      expect(getNewsDetailMock).not.toHaveBeenCalled();
      expect(redirectMock).toHaveBeenCalledWith(
        "/columns/a?draftKey=dk&contentId=c-1",
      );
    });

    it("endpoint=columns locale=en は /en/columns/... へ redirect", async () => {
      getColumnDetailMock.mockResolvedValue({ slug: "a", id: "c-1" });
      const { GET } = await import("./route");
      await expect(
        GET(
          makeReq(
            "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=dk&locale=en&endpoint=columns",
          ),
        ),
      ).rejects.toThrow(/NEXT_REDIRECT/);
      expect(redirectMock).toHaveBeenCalledWith(
        "/en/columns/a?draftKey=dk&contentId=c-1",
      );
    });

    it("endpoint=columns contentId 経由: getColumnByContentId で逆引きして /columns/... へ", async () => {
      getColumnByContentIdMock.mockResolvedValue({
        slug: "how-to-start",
        locale: "ja",
      });
      const { GET } = await import("./route");
      await expect(
        GET(
          makeReq(
            "http://localhost/api/draft/enable?secret=ds3cret&contentId=c-abc&draftKey=dk&endpoint=columns",
          ),
        ),
      ).rejects.toThrow(/NEXT_REDIRECT/);
      expect(getColumnByContentIdMock).toHaveBeenCalledWith({
        id: "c-abc",
        draftKey: "dk",
      });
      expect(redirectMock).toHaveBeenCalledWith(
        "/columns/how-to-start?draftKey=dk&contentId=c-abc",
      );
    });

    it("endpoint 許可リスト外 (誤値) は401", async () => {
      const { GET } = await import("./route");
      const res = await GET(
        makeReq(
          "http://localhost/api/draft/enable?secret=ds3cret&slug=a&draftKey=dk&endpoint=evil",
        ),
      );
      expect(res.status).toBe(401);
      expect(getNewsDetailMock).not.toHaveBeenCalled();
      expect(getColumnDetailMock).not.toHaveBeenCalled();
    });
  });
});
