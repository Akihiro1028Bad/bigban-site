import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
vi.mock("@/config/featureFlags", () => ({
  isCmsColumnsEnabled: () => true,
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Nav・Footer・HYROX 見出しを描画する", () => {
    renderWithIntl(<HyroxContent />);
    expect(screen.getByTestId("nav")).toHaveAttribute(
      "data-show-columns",
      "true",
    );
    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /^HYROX/ }),
    ).toBeInTheDocument();
  });

  it("コラム CMS 有効時、入門コラムへの内部リンクを描画する", () => {
    renderWithIntl(<HyroxContent />);
    expect(
      screen.getByRole("link", { name: /ハイロックスとは/ }),
    ).toHaveAttribute("href", "/columns/hyrox-beginners-guide");
  });

  it("NEXT RACE は PROGRAM(料金)の直前に並ぶ", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T00:00:00+09:00"));
    renderWithIntl(<HyroxContent />);
    const nextRace = screen.getByRole("heading", { level: 2, name: /^NEXT RACE/ });
    const program = screen.getByRole("heading", { level: 2, name: /^PROGRAM/ });
    expect(
      nextRace.compareDocumentPosition(program) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const between = Array.from(document.querySelectorAll("main > section"));
    const nextRaceIndex = between.indexOf(nextRace.closest("section") as HTMLElement);
    const programIndex = between.indexOf(program.closest("section") as HTMLElement);
    expect(programIndex - nextRaceIndex).toBe(1);
  });
});
