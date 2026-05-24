import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxHero from "./HyroxHero";

describe("HyroxHero", () => {
  it("見出し HYROX とタグラインを表示する", () => {
    renderWithIntl(<HyroxHero />);
    expect(screen.getByRole("heading", { name: "HYROX" })).toBeInTheDocument();
    expect(screen.getByText("RUN. WORKOUT. REPEAT.")).toBeInTheDocument();
  });

  it("COMING SOON バッジと予約 CTA を表示する", () => {
    renderWithIntl(<HyroxHero />);
    expect(screen.getByText("COMING SOON")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "体験予約" })).toBeInTheDocument();
  });
});
