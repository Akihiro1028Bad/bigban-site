import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import FirstVisitFacts from "./FirstVisitFacts";

describe("FirstVisitFacts", () => {
  it("見出しと9項目の定義リストを表示する", () => {
    const { container } = renderWithIntl(<FirstVisitFacts />);
    expect(
      screen.getByRole("heading", { level: 2, name: "ご利用の前に" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("dt")).toHaveLength(9);
    expect(container.querySelectorAll("dd")).toHaveLength(9);
  });

  it("持ち物・レンタル・シューズの案内(ノーマーキングシューズ表記)", () => {
    renderWithIntl(<FirstVisitFacts />);
    expect(
      screen.getByText("ノーマーキングシューズ(シューズの貸出はありません)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("パドル 1本 ¥500(1コートにつき6本まで)"),
    ).toBeInTheDocument();
  });

  it("受付開始日は定数から埋まり、時刻は書かない", () => {
    renderWithIntl(<FirstVisitFacts />);
    const text = screen.getByText(/一般のご予約は/).textContent ?? "";
    expect(text).toBe("一般のご予約は14日前から、PBT CLUB会員は30日前からです。");
    expect(text).not.toMatch(/\d+時|0:00/);
  });

  it("キャンセルは LaBOLA の規定へ、1人参加は施設主催イベントへ案内する", () => {
    renderWithIntl(<FirstVisitFacts />);
    expect(
      screen.getByText(/予約システム\(LaBOLA\)の規定に従います/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/施設主催のイベントへ/).length,
    ).toBeGreaterThan(0);
  });

  it("駐車場はコインパーキング案内、天井・照明・駐車場なしは出さない", () => {
    const { container } = renderWithIntl(<FirstVisitFacts />);
    expect(screen.getByText("近隣のコインパーキングをご利用ください。")).toBeInTheDocument();
    const text = container.textContent ?? "";
    for (const word of ["天井", "照明", "駐車場なし"]) {
      expect(text).not.toContain(word);
    }
    expect(text).toContain("年中無休");
    expect(text).toContain("シャワーはありません");
  });
});
