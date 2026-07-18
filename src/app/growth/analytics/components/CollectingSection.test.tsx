import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CollectingSection } from "./CollectingSection";
describe("CollectingSection", () => { it("収集中の領域をリストで表示する", () => { render(<CollectingSection sections={["ペースカーブはP4で解禁"]} />); expect(screen.getByRole("heading", { name: "これからの分析" })).toBeVisible(); expect(screen.getByText("収集中")).toBeVisible(); expect(screen.getByText("ペースカーブはP4で解禁")).toBeVisible(); }); });
