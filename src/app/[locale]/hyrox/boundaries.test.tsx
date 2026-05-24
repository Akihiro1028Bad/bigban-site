import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import Loading from "./loading";
import ErrorBoundary from "./error";

describe("hyrox boundaries", () => {
  it("loading が描画される", () => {
    const { container } = render(<Loading />);
    expect(container.firstChild).toBeTruthy();
  });

  it("ja: error の再読み込みで reset が呼ばれる", () => {
    const reset = vi.fn();
    renderWithIntl(<ErrorBoundary reset={reset} />, { locale: "ja" });
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("en: 英語の文言とラベルを表示する", () => {
    const reset = vi.fn();
    renderWithIntl(<ErrorBoundary reset={reset} />, { locale: "en" });
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
