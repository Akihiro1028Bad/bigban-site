import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";

vi.mock("@/components/home/HomeNavigation", () => ({ default: () => <nav data-testid="nav" /> }));
vi.mock("@/components/home/HomeFooter", () => ({ default: () => <footer data-testid="footer" /> }));

import HyroxContent from "./HyroxContent";

describe("HyroxContent", () => {
  it("Nav・Footer・HYROX 見出しを描画する", () => {
    renderWithIntl(<HyroxContent />);
    expect(screen.getByTestId("nav")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "HYROX" })).toBeInTheDocument();
  });
});
