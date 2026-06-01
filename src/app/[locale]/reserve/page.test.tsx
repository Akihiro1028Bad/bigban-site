import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
}));

import ReservePage from "./page";

describe("ReservePage", () => {
  it("不正な locale で notFound を呼ぶ", async () => {
    await expect(
      ReservePage({ params: Promise.resolve({ locale: "xx" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
