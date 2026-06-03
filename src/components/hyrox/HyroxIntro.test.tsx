import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxIntro from "./HyroxIntro";

describe("HyroxIntro", () => {
  it("WHAT IS HYROX 見出しを表示する", () => {
    renderWithIntl(<HyroxIntro />);
    expect(screen.getByRole("heading", { name: "WHAT IS HYROX" })).toBeInTheDocument();
  });

  it("キーナンバー表示は出さない", () => {
    renderWithIntl(<HyroxIntro />);
    expect(screen.queryByText("KM RUN")).not.toBeInTheDocument();
    expect(screen.queryByText("WORKOUTS")).not.toBeInTheDocument();
    expect(screen.queryByText("RACE")).not.toBeInTheDocument();
  });
});
