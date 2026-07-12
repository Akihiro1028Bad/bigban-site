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

  it("非ASCIIの合言葉は percent-encode してヘッダに載せる(ISO-8859-1 制約の回避)", () => {
    expect(authHeaders("ひみつの合言葉")).toEqual({
      Authorization: `Bearer ${encodeURIComponent("ひみつの合言葉")}`,
    });
  });

  it("encode 後のヘッダ値は ASCII のみ(fetch の Latin-1 制約を満たす)", () => {
    const value = authHeaders("合言葉🔑テスト").Authorization;
    const allAscii = [...value].every((ch) => ch.charCodeAt(0) <= 0x7f);
    expect(allAscii).toBe(true);
  });
});
