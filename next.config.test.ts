// @vitest-environment node
import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("nextConfig", () => {
  it("ニュースのセキュリティヘッダーを返す", async () => {
    const headers = await nextConfig.headers?.();
    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "/:locale(ja|en)?/news/:path*" }),
      ]),
    );
  });

  it("microCMS の画像ホストだけを許可する", () => {
    expect(nextConfig.images?.remotePatterns).toEqual([
      expect.objectContaining({ hostname: "images.microcms-assets.io" }),
    ]);
  });
});
