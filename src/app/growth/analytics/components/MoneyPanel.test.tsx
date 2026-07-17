import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MoneyPanel } from "./MoneyPanel";

describe("MoneyPanel", () => {
  it("整形済みの金額と未収集状態を表示する", () => {
    const { rerender } = render(<MoneyPanel money={{ currentWeek: "¥12,000", forecast28: "¥40,000" }} />);
    expect(screen.getByText("¥12,000")).toBeVisible();
    rerender(<MoneyPanel money={{ currentWeek: "収集中", forecast28: "収集中" }} />);
    expect(screen.getAllByText("収集中")).toHaveLength(2);
  });

  it("P1拡張のお金情報を表示する", () => {
    render(<MoneyPanel money={{ currentWeek: "¥0", forecast28: "¥0" }} extra={{ unpaid: { headline: "2件 ¥3,000", overdue: "15日以上 ¥2,000" }, paymentShare: [{ method: "カード", pct: 75 }], revPach: "¥100" }} />);
    expect(screen.getByText("15日以上 ¥2,000")).toBeVisible();
    expect(screen.getByRole("list", { name: "支払い方法構成" })).toHaveTextContent("カード 75%");
    expect(screen.getByText("¥100")).toBeVisible();
  });

  it("拡張情報が空なら未収金・RevPACH・支払い方法リストを表示しない", () => {
    render(<MoneyPanel money={{ currentWeek: "¥0", forecast28: "¥0" }} extra={{ unpaid: null, paymentShare: [], revPach: null }} />);
    expect(screen.queryByText("未収金")).toBeNull();
    expect(screen.queryByText("RevPACH")).toBeNull();
    expect(screen.queryByRole("list", { name: "支払い方法構成" })).toBeNull();
  });

  it("延滞内訳のない未収金は見出しだけを表示する", () => {
    render(<MoneyPanel money={{ currentWeek: "¥0", forecast28: "¥0" }} extra={{ unpaid: { headline: "1件 ¥500", overdue: null }, paymentShare: [], revPach: null }} />);
    expect(screen.getByText("1件 ¥500")).toBeVisible();
    expect(screen.queryByText(/15日以上/)).toBeNull();
  });
});
