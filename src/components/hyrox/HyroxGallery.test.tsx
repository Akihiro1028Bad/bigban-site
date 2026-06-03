import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxGallery from "./HyroxGallery";

describe("HyroxGallery", () => {
  it("IN ACTION 見出しを表示する", () => {
    renderWithIntl(<HyroxGallery />);
    expect(
      screen.getByRole("heading", { name: "IN ACTION" })
    ).toBeInTheDocument();
  });

  it("6枚のアクション画像を表示する", () => {
    renderWithIntl(<HyroxGallery />);
    expect(screen.getAllByRole("img")).toHaveLength(6);
  });
});
