// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("./ApproveClient", () => ({
  ApproveClient: ({ token }: { token: string }) => `client:${token}`,
}));

import ApprovePage from "./page";

describe("ApprovePage", () => {
  it("token クエリを ApproveClient に渡す", async () => {
    const el = await ApprovePage({ searchParams: Promise.resolve({ token: "abc" }) });
    expect(el.props.token).toBe("abc");
  });

  it("token が無い/配列なら空文字を渡す", async () => {
    const missing = await ApprovePage({ searchParams: Promise.resolve({}) });
    expect(missing.props.token).toBe("");

    const arr = await ApprovePage({ searchParams: Promise.resolve({ token: ["a", "b"] }) });
    expect(arr.props.token).toBe("");
  });
});
