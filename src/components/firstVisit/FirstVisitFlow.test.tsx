import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import FirstVisitFlow from "./FirstVisitFlow";

describe("FirstVisitFlow", () => {
  it("見出しと4ステップを順に表示する", () => {
    renderWithIntl(<FirstVisitFlow />);
    expect(
      screen.getByRole("heading", { level: 2, name: "ご利用の流れ" }),
    ).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual([
      "予約する",
      "オンラインで支払う",
      "入館する",
      "プレーする",
    ]);
  });

  it("入館は予約時間になったらそのまま入れると伝える(具体的な解錠手順は書かない)", () => {
    renderWithIntl(<FirstVisitFlow />);
    const items = screen.getAllByRole("listitem");
    expect(
      within(items[2]).getByText(/予約時間になったらそのまま入館できます/),
    ).toBeInTheDocument();
  });

  it("連番は装飾として支援技術に読ませない", () => {
    const { container } = renderWithIntl(<FirstVisitFlow />);
    const numbers = [...container.querySelectorAll("[aria-hidden='true']")].map(
      (el) => el.textContent,
    );
    expect(numbers).toEqual(["01", "02", "03", "04"]);
  });
});
