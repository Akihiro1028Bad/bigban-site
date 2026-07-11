import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";

// next-intl/middleware をモック
const mockIntlMiddleware = vi.fn();
vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() => mockIntlMiddleware),
}));

// 環境変数のリセット用
const originalEnv = process.env.NEXT_PUBLIC_MAINTENANCE;

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    mockIntlMiddleware.mockReset();
    delete process.env.NEXT_PUBLIC_MAINTENANCE;
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_MAINTENANCE;
    } else {
      process.env.NEXT_PUBLIC_MAINTENANCE = originalEnv;
    }
  });

  describe("maintenance mode OFF", () => {
    it("delegates to next-intl middleware for root path", async () => {
      const { middleware } = await import("./middleware");
      const request = createRequest("/");
      mockIntlMiddleware.mockReturnValue(new Response());

      middleware(request);

      expect(mockIntlMiddleware).toHaveBeenCalledWith(request);
    });

    it("delegates to next-intl middleware for /en path", async () => {
      const { middleware } = await import("./middleware");
      const request = createRequest("/en");
      mockIntlMiddleware.mockReturnValue(new Response());

      middleware(request);

      expect(mockIntlMiddleware).toHaveBeenCalledWith(request);
    });

    it("delegates to next-intl middleware for /en/about", async () => {
      const { middleware } = await import("./middleware");
      const request = createRequest("/en/about");
      mockIntlMiddleware.mockReturnValue(new Response());

      middleware(request);

      expect(mockIntlMiddleware).toHaveBeenCalledWith(request);
    });
  });

  describe("maintenance mode ON", () => {
    it("rewrites root to /ja/teaser (URL preserved)", async () => {
      process.env.NEXT_PUBLIC_MAINTENANCE = "true";
      const { middleware } = await import("./middleware");
      const request = createRequest("/");

      const response = middleware(request);

      expect(response.headers.get("x-middleware-rewrite")).toContain("/ja/teaser");
    });

    it("rewrites /en/about to /ja/teaser", async () => {
      process.env.NEXT_PUBLIC_MAINTENANCE = "true";
      const { middleware } = await import("./middleware");
      const request = createRequest("/en/about");

      const response = middleware(request);

      expect(response.headers.get("x-middleware-rewrite")).toContain("/ja/teaser");
    });

    it("rewrites /ja/teaser to /ja/teaser (no infinite loop)", async () => {
      process.env.NEXT_PUBLIC_MAINTENANCE = "true";
      const { middleware } = await import("./middleware");
      const request = createRequest("/ja/teaser");

      const response = middleware(request);

      expect(response.headers.get("x-middleware-rewrite")).toContain("/ja/teaser");
    });

    it("allows /teaser through via i18n routing", async () => {
      process.env.NEXT_PUBLIC_MAINTENANCE = "true";
      const { middleware } = await import("./middleware");
      const request = createRequest("/teaser");
      mockIntlMiddleware.mockReturnValue(new Response());

      middleware(request);

      expect(mockIntlMiddleware).toHaveBeenCalledWith(request);
    });

    it("allows static assets through", async () => {
      process.env.NEXT_PUBLIC_MAINTENANCE = "true";
      const { middleware } = await import("./middleware");
      const request = createRequest("/logos/mark-neon.png");
      mockIntlMiddleware.mockReturnValue(new Response());

      middleware(request);

      expect(mockIntlMiddleware).toHaveBeenCalledWith(request);
    });
  });

  describe("config matcher", () => {
    it("exports a matcher config", async () => {
      const { config } = await import("./middleware");
      expect(config.matcher).toBeDefined();
      expect(Array.isArray(config.matcher)).toBe(true);
    });

    // matcher は「ミドルウェアを動かすパス」を表す否定先読み正規表現。
    // JS RegExp として評価し、対象/除外を直接検証する(#102 回帰テスト)。
    async function runsMiddleware(pathname: string): Promise<boolean> {
      const { config } = await import("./middleware");
      const pattern = (config.matcher as string[])[0];
      return new RegExp(`^${pattern}$`).test(pathname);
    }

    it("i18n 対象パス(/, /ja/about)はミドルウェアを通す", async () => {
      expect(await runsMiddleware("/")).toBe(true);
      expect(await runsMiddleware("/ja/about")).toBe(true);
      expect(await runsMiddleware("/en/news")).toBe(true);
    });

    it("/draft-frame は i18n ミドルウェアの対象外(#102)", async () => {
      // iframe プレビュールートが locale 付きへ書き換えられ 404 になる事象の回帰防止。
      expect(await runsMiddleware("/draft-frame")).toBe(false);
    });

    it("既存の除外(/growth/approve, /api/...)も対象外のまま", async () => {
      expect(await runsMiddleware("/growth/approve")).toBe(false);
      expect(await runsMiddleware("/api/growth/draft")).toBe(false);
    });
  });
});
