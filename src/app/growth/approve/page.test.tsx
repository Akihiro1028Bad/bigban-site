// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("./ApproveClient", () => ({
  ApproveClient: () => "client",
}));

import ApprovePage from "./page";

describe("ApprovePage", () => {
  it("ApproveClient を描画する", () => {
    const el = ApprovePage();
    expect(el.type).toBeTypeOf("function");
  });
});
