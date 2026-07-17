import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgramPanel } from "./ProgramPanel";

describe("ProgramPanel", () => {
  it("プログラムの埋まり率と状態を表示する", () => { render(<ProgramPanel programs={[{ title: "初心者クラス", schedule: "2026-07-17 10:00", fill: "6/6", state: "full" }]} />); expect(screen.getByRole("heading", { name: "プログラム" })).toBeVisible(); expect(screen.getByText("6/6")).toHaveClass("analytics-program-fill-full"); });
  it("空なら空状態を表示する", () => { render(<ProgramPanel programs={[]} />); expect(screen.getByText("対象のプログラムはありません。")).toBeVisible(); });
});
