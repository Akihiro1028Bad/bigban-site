import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiHeader } from "./KpiHeader";
describe("KpiHeader", () => { it("KPIカードを見出し付きで描画する", () => { render(<KpiHeader cards={[{ label: "実予約", value: "8件", sub: "累積 42件" }]} />); expect(screen.getByRole("heading", { name: "経営サマリー" })).toBeVisible(); expect(screen.getByText("8件")).toBeVisible(); }); });
