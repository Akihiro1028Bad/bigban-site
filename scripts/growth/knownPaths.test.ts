import { describe, expect, it } from "vitest";

import { buildKnownArticlePaths } from "./knownPaths";

describe("buildKnownArticlePaths", () => {
  it("news の ja slug だけを /ja/news/<slug> に写像する", () => {
    expect(
      buildKnownArticlePaths("news", [
        { locale: "ja", slug: "local-pickleball" },
        { locale: "en", slug: "local-pickleball-en" },
        { locale: "fr", slug: "local-pickleball-fr" },
      ]),
    ).toEqual(["/ja/news/local-pickleball"]);
  });

  it("空 slug 配列なら空配列を返す", () => {
    expect(buildKnownArticlePaths("news", [])).toEqual([]);
  });

  it("columns は /ja/columns/<slug> に写像する", () => {
    expect(
      buildKnownArticlePaths("columns", [
        { locale: "ja", slug: "beginner-guide" },
        { locale: "en", slug: "beginner-guide-en" },
      ]),
    ).toEqual(["/ja/columns/beginner-guide"]);
  });
});
