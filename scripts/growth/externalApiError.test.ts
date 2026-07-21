// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ExternalApiError,
  diagnosticDetail,
  externalApiErrorFromResponse,
  requestIdFromResponse,
  safeExternalError,
} from "./externalApiError";

describe("ExternalApiError", () => {
  it("response headerのrequest IDを優先し本文をmessageへ含めない", () => {
    const response = new Response("<html>secret body</html>", {
      status: 502,
      headers: { "x-request-id": "req-header" },
    });
    const error = externalApiErrorFromResponse("microcms.publish", response, () => "local-id");

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({
      operation: "microcms.publish",
      status: 502,
      requestId: "req-header",
    });
    expect(error.message).toBe("microcms.publish failed (HTTP 502, requestId=req-header)");
    expect(error.message).not.toContain("secret body");
  });

  it("headerが無ければローカルIDを使い、安全な構造へ絞る", () => {
    const error = externalApiErrorFromResponse(
      "line.push",
      new Response("private", { status: 400 }),
      () => "local-id"
    );

    expect(safeExternalError(error)).toEqual({
      operation: "line.push",
      status: 400,
      requestId: "local-id",
    });
    expect(safeExternalError(new Error("raw secret"))).toEqual({
      operation: "external.unknown",
      status: null,
      requestId: "unknown",
    });
  });

  it("microCMS request IDを第二優先にし、headers無しも扱う", () => {
    expect(
      externalApiErrorFromResponse(
        "microcms.list",
        { status: 500, headers: new Headers({ "x-microcms-request-id": "micro-id" }) },
        () => "local"
      ).requestId
    ).toBe("micro-id");
    expect(externalApiErrorFromResponse("x", { status: 500 }, () => "local").requestId).toBe("local");
    expect(diagnosticDetail("plain")).toBe("plain");
    expect(diagnosticDetail("plain", { secrets: [""] })).toBe("plain");
    expect(externalApiErrorFromResponse("x", { status: 500 }).requestId).not.toBe("");
    expect(requestIdFromResponse({})).not.toBe("");
  });

  it("診断文字列の資格情報・query・HTMLをredactし1024文字に制限する", () => {
    const detail = diagnosticDetail(
      `Authorization: Bearer abc API_KEY=key https://x.test/?token=q <p>html</p> ${"z".repeat(2_000)}`,
      { secrets: ["key"] }
    );

    expect(detail).not.toContain("abc");
    expect(detail).not.toContain("key");
    expect(detail).not.toContain("token=q");
    expect(detail).not.toContain("<p>");
    expect(detail.length).toBeLessThanOrEqual(1_024);
  });
});
