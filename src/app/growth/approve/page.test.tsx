// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("./ApproveClient", () => ({
  ApproveClient: () => "client",
}));

import ApprovePage, { metadata } from "./page";

describe("ApprovePage", () => {
  it("ApproveClient を描画する", () => {
    const el = ApprovePage();
    expect(el.type).toBeTypeOf("function");
  });

  it("ページタイトルを持つ(axe document-title 対応)", () => {
    expect(metadata.title).toBe("記事承認コンソール");
  });
});
