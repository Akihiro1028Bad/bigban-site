import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveSteps from "./ReserveSteps";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("ReserveSteps", () => {
  it("3つのステップを順序付きリストで表示する", () => {
    renderWithIntl(<ReserveSteps />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(screen.getByText("日時を選ぶ")).toBeInTheDocument();
    expect(screen.getByText("予約内容を入力")).toBeInTheDocument();
    expect(screen.getByText("予約完了（決済）")).toBeInTheDocument();
  });

  it("ステップ一覧（ol）に予約の流れを示す aria-label を付与する", () => {
    renderWithIntl(<ReserveSteps />);
    expect(
      screen.getByRole("list", { name: "予約の流れ" })
    ).toBeInTheDocument();
  });

  it("各ステップに連番（01・02・03）を表示する", () => {
    renderWithIntl(<ReserveSteps />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("ステップ01は操作デモ動画を表示する", () => {
    const { container } = renderWithIntl(<ReserveSteps />);
    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute(
      "aria-label",
      "予約カレンダーで日時を選ぶ操作画面"
    );
  });

  it("ステップ02・03はスクリーンショット画像を alt 付きで表示する", () => {
    renderWithIntl(<ReserveSteps />);
    expect(screen.getByAltText("ご予約内容の確認画面")).toBeInTheDocument();
    expect(screen.getByAltText("予約完了の画面")).toBeInTheDocument();
  });
});
