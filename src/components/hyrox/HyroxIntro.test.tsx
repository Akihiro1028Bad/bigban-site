import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxIntro from "./HyroxIntro";

describe("HyroxIntro", () => {
  it("WHAT IS HYROX 見出しを表示する", () => {
    renderWithIntl(<HyroxIntro />);
    expect(screen.getByRole("heading", { name: "WHAT IS HYROX" })).toBeInTheDocument();
  });

  it("3つの Key Number ラベル(KM RUN / WORKOUTS / RACE)を表示する", () => {
    renderWithIntl(<HyroxIntro />);
    expect(screen.getByText("KM RUN")).toBeInTheDocument();
    expect(screen.getByText("WORKOUTS")).toBeInTheDocument();
    expect(screen.getByText("RACE")).toBeInTheDocument();
  });
});
