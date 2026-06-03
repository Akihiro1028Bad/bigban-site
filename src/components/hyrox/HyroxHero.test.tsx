import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxHero from "./HyroxHero";

describe("HyroxHero", () => {
  it("見出し HYROX と和名 ハイロックス を表示する", () => {
    renderWithIntl(<HyroxHero />);
    expect(screen.getByRole("heading", { name: "HYROX" })).toBeInTheDocument();
    expect(screen.getByText("ハイロックス")).toBeInTheDocument();
  });

  it("予約 CTA を表示する", () => {
    renderWithIntl(<HyroxHero />);
    expect(screen.getByRole("link", { name: "体験予約" })).toBeInTheDocument();
  });
});
