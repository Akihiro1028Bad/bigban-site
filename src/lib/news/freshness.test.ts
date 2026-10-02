import { describe, expect, it } from "vitest";

import { hasFreshNews } from "./freshness";

const NOW = new Date("2026-10-01T00:00:00Z");

describe("hasFreshNews", () => {
  it("空配列は false", () => {
    expect(hasFreshNews([], NOW, 30)).toBe(false);
  });

  it("基準日数ちょうどの記事は新鮮とみなす", () => {
    expect(
      hasFreshNews([{ createdAt: "2026-09-01T00:00:00Z" }], NOW, 30),
    ).toBe(true);
  });

  it("基準日数を1秒でも超えたら古い", () => {
    expect(
      hasFreshNews([{ createdAt: "2026-08-31T23:59:59Z" }], NOW, 30),
    ).toBe(false);
  });

  it("publishedAt があれば createdAt より優先する", () => {
    expect(
      hasFreshNews(
        [{ publishedAt: "2026-09-30T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" }],
        NOW,
        30,
      ),
    ).toBe(true);
  });

  it("1本でも新鮮なら true", () => {
    expect(
      hasFreshNews(
        [
          { createdAt: "2026-08-17T00:00:00Z" },
          { createdAt: "2026-09-25T00:00:00Z" },
        ],
        NOW,
        30,
      ),
    ).toBe(true);
  });

  it("未来日付は新鮮とみなす", () => {
    expect(
      hasFreshNews([{ createdAt: "2026-10-05T00:00:00Z" }], NOW, 30),
    ).toBe(true);
  });
});
