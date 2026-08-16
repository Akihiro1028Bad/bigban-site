import { describe, it, expect } from "vitest";

import { newsLabel } from "./label";

describe("newsLabel", () => {
  it("ja は「ニュース」", () => {
    expect(newsLabel("ja")).toBe("ニュース");
  });

  it("ja 以外は「News」", () => {
    expect(newsLabel("en")).toBe("News");
  });
});
