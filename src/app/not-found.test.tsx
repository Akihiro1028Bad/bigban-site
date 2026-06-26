import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GlobalNotFound from "./not-found";

describe("GlobalNotFound", () => {
  it("404 表示とホームへの導線を持つ", () => {
    render(<GlobalNotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "ホームへ戻る" });
    expect(link).toHaveAttribute("href", "/");
  });

});
