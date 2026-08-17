import { describe, it, expect } from "vitest";

import { columnsLabel } from "./label";

describe("columnsLabel", () => {
  it("ja は「コラム」", () => {
    expect(columnsLabel("ja")).toBe("コラム");
  });

  it("ja 以外は「Column」", () => {
    expect(columnsLabel("en")).toBe("Column");
  });
});
