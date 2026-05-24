import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Loading from "./loading";
import ErrorBoundary from "./error";

describe("hyrox boundaries", () => {
  it("loading が描画される", () => {
    const { container } = render(<Loading />);
    expect(container.firstChild).toBeTruthy();
  });

  it("error の再読み込みで reset が呼ばれる", () => {
    const reset = vi.fn();
    render(<ErrorBoundary reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
