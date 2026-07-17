import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoneyPanel } from "./MoneyPanel";
describe("MoneyPanel", () => { it("整形済みの金額と未収集状態を表示する", () => { const { rerender } = render(<MoneyPanel money={{ currentWeek: "¥12,000", forecast28: "¥40,000" }} />); expect(screen.getByText("¥12,000")).toBeVisible(); rerender(<MoneyPanel money={{ currentWeek: "収集中", forecast28: "収集中" }} />); expect(screen.getAllByText("収集中")).toHaveLength(2); }); });
