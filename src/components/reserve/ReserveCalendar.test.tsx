import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveCalendar from "./ReserveCalendar";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function getIframe(container: HTMLElement): HTMLIFrameElement {
  const iframe = container.querySelector("iframe");
  if (!iframe) throw new Error("iframe not found");
  return iframe;
}

describe("ReserveCalendar", () => {
  it("見出し BOOK A COURT を表示する", () => {
    renderWithIntl(<ReserveCalendar />);
    expect(screen.getByText("BOOK A COURT")).toBeInTheDocument();
  });

  it("tablist と2つのタブ（ピックルボールコート / H Y R O X）を表示する", () => {
    renderWithIntl(<ReserveCalendar />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "ピックルボールコート" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "H Y R O X" })).toBeInTheDocument();
  });

  it("初期はピックルボールコートが選択され、iframe はそのカテゴリを表示する", () => {
    const { container } = renderWithIntl(<ReserveCalendar />);
    const pickleTab = screen.getByRole("tab", { name: "ピックルボールコート" });
    expect(pickleTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "H Y R O X" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(getIframe(container).getAttribute("src")).toContain(
      `tab_name=${encodeURIComponent("ピックルボールコート")}`,
    );
  });

  it("initialTab=hyrox のとき初期表示が H Y R O X になる", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <ReserveCalendar initialTab="hyrox" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("tab", { name: "H Y R O X" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(getIframe(container).getAttribute("src")).toContain(
      "tab_name=H%20Y%20R%20O%20X",
    );
  });

  it("HYROX タブをクリックすると iframe src が H%20Y%20R%20O%20X に切り替わる", () => {
    const { container } = renderWithIntl(<ReserveCalendar />);
    fireEvent.click(screen.getByRole("tab", { name: "H Y R O X" }));
    expect(screen.getByRole("tab", { name: "H Y R O X" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(getIframe(container).getAttribute("src")).toContain(
      "tab_name=H%20Y%20R%20O%20X",
    );
  });

  it("ArrowRight / ArrowLeft でタブを移動できる", () => {
    renderWithIntl(<ReserveCalendar />);
    const pickle = screen.getByRole("tab", { name: "ピックルボールコート" });
    const hyrox = screen.getByRole("tab", { name: "H Y R O X" });

    fireEvent.keyDown(pickle, { key: "ArrowRight" });
    expect(hyrox).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(hyrox, { key: "ArrowLeft" });
    expect(pickle).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowLeft は先頭から末尾へ、ArrowRight は末尾から先頭へ巡回する", () => {
    renderWithIntl(<ReserveCalendar />);
    const pickle = screen.getByRole("tab", { name: "ピックルボールコート" });
    const hyrox = screen.getByRole("tab", { name: "H Y R O X" });

    fireEvent.keyDown(pickle, { key: "ArrowLeft" });
    expect(hyrox).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(hyrox, { key: "ArrowRight" });
    expect(pickle).toHaveAttribute("aria-selected", "true");
  });

  it("Home / End で先頭・末尾のタブへ移動する", () => {
    renderWithIntl(<ReserveCalendar />);
    const pickle = screen.getByRole("tab", { name: "ピックルボールコート" });
    const hyrox = screen.getByRole("tab", { name: "H Y R O X" });

    fireEvent.keyDown(pickle, { key: "End" });
    expect(hyrox).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(hyrox, { key: "Home" });
    expect(pickle).toHaveAttribute("aria-selected", "true");
  });

  it("関係ないキーでは選択タブが変わらない", () => {
    renderWithIntl(<ReserveCalendar />);
    const pickle = screen.getByRole("tab", { name: "ピックルボールコート" });
    fireEvent.keyDown(pickle, { key: "a" });
    expect(pickle).toHaveAttribute("aria-selected", "true");
  });

  it("tabpanel 内にアクティブタブ名入りタイトルの iframe を持つ", () => {
    const { container } = renderWithIntl(<ReserveCalendar />);
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(getIframe(container)).toHaveAttribute(
      "title",
      "ピックルボールコート 予約カレンダー",
    );
  });

  it("カレンダー枠下にスクロール案内バーを表示する", () => {
    renderWithIntl(<ReserveCalendar />);
    expect(
      screen.getByText("上下にスクロールして全時間帯を表示"),
    ).toBeInTheDocument();
  });
});
