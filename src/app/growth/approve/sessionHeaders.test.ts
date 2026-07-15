import { describe, expect, it } from "vitest";

import { sessionHeaders } from "./sessionHeaders";

describe("sessionHeaders", () => {
  it("CSRF補強ヘッダを付けAuthorizationを生成しない", () => {
    expect(sessionHeaders({ "Content-Type": "application/json" })).toEqual({
      "Content-Type": "application/json",
      "X-Growth-Request": "1",
    });
    expect(sessionHeaders()).not.toHaveProperty("Authorization");
  });
});
