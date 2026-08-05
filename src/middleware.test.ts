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

    it("/contributors は [locale] 配下の通常ページなのでミドルウェアを通す", async () => {
      // 支援者ウォール。matcher から除外すると /ja へのリライトが効かず 404 になる。
      expect(await runsMiddleware("/contributors")).toBe(true);
      expect(await runsMiddleware("/en/contributors")).toBe(true);
    });

    it("/api 配下はミドルウェアの対象外のまま", async () => {
      expect(await runsMiddleware("/api/revalidate")).toBe(false);
    });
  });
});
