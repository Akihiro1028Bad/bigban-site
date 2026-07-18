import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FunnelPanel } from "./FunnelPanel";

describe("FunnelPanel", () => {
  it("ファネル未収集時は取り込み待ちを表示する", () => {
    render(<FunnelPanel view={null} />);
    expect(screen.getByText("収集中")).toBeVisible();
    expect(screen.getByText("(タグ設置後の取り込み待ち)")).toBeVisible();
  });

  it("段の件数・内訳・注記を読み上げ可能なテキストで表示する", () => {
    const { container } = render(<FunnelPanel view={{
      week: "07/13〜07/19",
      stages: [
        { label: "予約クリック", rental: 0, program: 0, total: 20, widthPct: 100, retentionPct: null },
        { label: "情報入力", rental: 8, program: 5, total: 13, widthPct: 17, retentionPct: 65 },
      ],
      capture: { text: "捕捉率 65%(GA4完了13件 ÷ セルフ予約20件)", isAlert: false },
      note: "実予約の真値はKPIヘッダー(CSV由来)。GA4は参考値(捕捉率つき)",
    }} />);
    expect(screen.getByRole("heading", { name: "予約ファネル(07/13〜07/19)" })).toBeVisible();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("予約クリック 20件");
    expect(screen.getByText("情報入力 13件")).toBeVisible();
    expect(screen.getByText("レンタル 8件 / プログラム 5件")).toBeVisible();
    expect(screen.getByText("→ 65%")).toBeVisible();
    expect(container.querySelectorAll(".analytics-funnel-bar")[1]).toHaveStyle({ width: "17%" });
    expect(screen.getByText("実予約の真値はKPIヘッダー(CSV由来)。GA4は参考値(捕捉率つき)")).toBeVisible();
  });

  it("捕捉率の警戒時にalert用クラスを付与し、全段0件でも表示する", () => {
    render(<FunnelPanel view={{ week: "07/13〜07/19", stages: [{ label: "予約クリック", rental: 0, program: 0, total: 0, widthPct: 100, retentionPct: null }], capture: { text: "捕捉率 49%", isAlert: true }, note: "注記" }} />);
    expect(screen.getByText("捕捉率 49%")).toHaveClass("analytics-funnel-capture-alert");
    expect(screen.getByText("要確認")).toBeVisible();
    expect(screen.getByText("予約クリック 0件")).toBeVisible();
  });
});
