import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";

import type React from "react";

// HyroxFilm がビューポート監視に使う IntersectionObserver は jsdom 未実装のためスタブ
beforeEach(() => {
  global.IntersectionObserver = vi.fn(function (this: IntersectionObserver) {
    this.observe = vi.fn();
    this.unobserve = vi.fn();
    this.disconnect = vi.fn();
    this.takeRecords = vi.fn();
    return this;
  }) as unknown as typeof IntersectionObserver;
});

vi.mock("@/components/home/HomeNavigation", () => ({
  default: ({ showColumns }: { showColumns?: boolean }) => (
    <nav data-testid="nav" data-show-columns={showColumns} />
  ),
}));
const shouldShowColumnsMock = vi.fn(async (_locale: string) => true);
vi.mock("@/lib/columns/visibility", () => ({
  shouldShowColumns: (locale: string) => shouldShowColumnsMock(locale),
}));
vi.mock("@/components/home/HomeFooter", () => ({ default: () => <footer data-testid="footer" /> }));
// HyroxFacility は Embla（ResizeObserver 依存）を使うため、構成確認用にスタブ化
vi.mock("@/components/hyrox/HyroxFacility", () => ({ default: () => <section data-testid="facility" /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

import HyroxContent from "./HyroxContent";

describe("HyroxContent", () => {
  beforeEach(() => {
    shouldShowColumnsMock.mockReset().mockResolvedValue(true);
  });

  it("Nav・Footer・HYROX 見出しを描画する", async () => {
    renderWithIntl(await HyroxContent({ locale: "ja" }));
    expect(screen.getByTestId("nav")).toHaveAttribute(
      "data-show-columns",
      "true",
    );
    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /^HYROX/ }),
    ).toBeInTheDocument();
  });

  it("日本語でコラムを出すとき、入門コラムへの内部リンクを描画する", async () => {
    renderWithIntl(await HyroxContent({ locale: "ja" }));
    expect(shouldShowColumnsMock).toHaveBeenCalledWith("ja");
    expect(
      screen.getByRole("link", { name: /ハイロックスとは/ }),
    ).toHaveAttribute("href", "/columns/hyrox-beginners-guide");
  });

  it("英語でコラムを出さない(0件)とき、ナビにも入門コラムリンクにも出さない(404を作らない)", async () => {
    shouldShowColumnsMock.mockResolvedValue(false);
    renderWithIntl(await HyroxContent({ locale: "en" }), { locale: "en" });
    expect(shouldShowColumnsMock).toHaveBeenCalledWith("en");
    expect(screen.getByTestId("nav")).toHaveAttribute(
      "data-show-columns",
      "false",
    );
    expect(
      screen.queryByRole("link", { name: /beginner's guide/i }),
    ).not.toBeInTheDocument();
  });
});
