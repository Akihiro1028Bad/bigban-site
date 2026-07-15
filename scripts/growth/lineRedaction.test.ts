// @vitest-environment node
import { describe, expect, it } from "vitest";

import { sanitizeLinePayload } from "./lineRedaction";

describe("sanitizeLinePayload", () => {
  it("再帰的にsecret・Bearer・token query・HTML・HTTP本文を除去する", () => {
    const payload = {
      text: "secret-value Bearer abc.def https://x.test/a?token=query-secret HTTP 500: private body",
      contents: [{ altText: "<p>private html</p>" }],
      untouched: 42,
    };

    const sanitized = sanitizeLinePayload(payload, {
      secrets: ["secret-value", "abc.def", "query-secret"],
    });
    const json = JSON.stringify(sanitized);

    expect(json).not.toContain("secret-value");
    expect(json).not.toContain("abc.def");
    expect(json).not.toContain("query-secret");
    expect(json).not.toContain("private body");
    expect(json).not.toContain("private html");
    expect(sanitized).toMatchObject({ untouched: 42 });
  });

  it("null・boolean・配列を保ち、長い文字列を上限内へ丸める", () => {
    const sanitized = sanitizeLinePayload([null, true, "x".repeat(2_000)], {
      maxStringLength: 32,
    });

    expect(sanitized[0]).toBeNull();
    expect(sanitized[1]).toBe(true);
    expect(sanitized[2]).toBe("x".repeat(31) + "…");
  });

  it("空secretを無視し、正規表現文字を含むsecretと既定長を安全に扱う", () => {
    expect(sanitizeLinePayload("a.b aXb", { secrets: ["", "a.b"] })).toBe("[redacted] aXb");
    expect(sanitizeLinePayload("x".repeat(1_100)).length).toBe(1_024);
    expect(sanitizeLinePayload("abc", { maxStringLength: 0 })).toBe("…");
  });

  it("値が事前登録されていないAPI key表記も除去する", () => {
    const sanitized = sanitizeLinePayload(
      "X-MICROCMS-API-KEY: live-key API_KEY=another-key apiKey: third-key"
    );

    expect(sanitized).not.toContain("live-key");
    expect(sanitized).not.toContain("another-key");
    expect(sanitized).not.toContain("third-key");
    expect(sanitized).toContain("[redacted]");
  });

  it("括弧付きHTTP status以降の複数行本文をすべて除去する", () => {
    const sanitized = sanitizeLinePayload(
      "下書き取得に失敗しました (HTTP 500): first private line\nsecond private line\nthird private line"
    );

    expect(sanitized).toBe("下書き取得に失敗しました (HTTP 500): [redacted]");
  });
});
