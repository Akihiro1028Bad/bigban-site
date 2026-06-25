import { describe, expect, it } from "vitest";

import { authHeaders } from "./authHeaders";

describe("authHeaders", () => {
  it("Authorization: Bearer を付ける", () => {
    expect(authHeaders("my-token")).toEqual({ Authorization: "Bearer my-token" });
  });

  it("既存ヘッダにマージする", () => {
    expect(authHeaders("t", { "Content-Type": "application/json" })).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer t",
    });
  });
});
