import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CollectingSection } from "./CollectingSection";
describe("CollectingSection", () => {
  it("収集中の領域をリストで表示する", () => { render(<CollectingSection sections={["売上データ"]} />); expect(screen.getByRole("heading", { name: "これからの分析" })).toBeVisible(); expect(screen.getByText("収集中")).toBeVisible(); expect(screen.getByText("売上データ")).toBeVisible(); });
  it("収集中の項目が無ければ何も表示しない", () => { render(<CollectingSection sections={[]} />); expect(screen.queryByRole("heading", { name: "これからの分析" })).toBeNull(); });
});
