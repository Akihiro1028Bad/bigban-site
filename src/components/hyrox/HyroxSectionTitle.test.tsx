import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HyroxSectionTitle from "./HyroxSectionTitle";

describe("HyroxSectionTitle", () => {
  it("英語の大見出しと日本語の小見出しを1つの h2 にまとめる", () => {
    render(<HyroxSectionTitle title="ACCESS" titleJa="アクセス" />);
    const h2 = screen.getByRole("heading", { level: 2, name: "ACCESS アクセス" });
    // 日本語側は既存の小見出しと同じ見た目の span(ブロック表示)
    const sub = h2.querySelector("span");
    expect(sub).toHaveTextContent("アクセス");
    expect(sub).toHaveClass("block", "text-xs", "text-text-gray");
  });
});
