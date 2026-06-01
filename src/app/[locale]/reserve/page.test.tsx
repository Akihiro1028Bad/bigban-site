import { describe, it, expect, vi } from "vitest";

// HomeNavigation 経由で読み込まれる next-intl navigation の
// next/navigation 解決を回避するためモックする（既存テストと同方針）。
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

import ReservePage from "./page";

describe("ReservePage", () => {
  it("不正な locale で notFound により描画されない（throw する）", async () => {
    await expect(
      ReservePage({ params: Promise.resolve({ locale: "xx" }) })
    ).rejects.toThrow();
  });
});
