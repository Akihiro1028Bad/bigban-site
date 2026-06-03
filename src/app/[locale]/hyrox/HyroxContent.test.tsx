import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";

import type React from "react";

vi.mock("@/components/home/HomeNavigation", () => ({ default: () => <nav data-testid="nav" /> }));
vi.mock("@/components/home/HomeFooter", () => ({ default: () => <footer data-testid="footer" /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

import HyroxContent from "./HyroxContent";

describe("HyroxContent", () => {
  it("Nav・Footer・HYROX 見出しを描画する", () => {
    renderWithIntl(<HyroxContent />);
    expect(screen.getByTestId("nav")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "HYROX" })).toBeInTheDocument();
  });
});
