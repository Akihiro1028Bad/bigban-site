import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import PrivateDetails from "./PrivateDetails";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement, locale: "ja" | "en" = "ja") {
  const messages = locale === "ja" ? jaMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PrivateDetails", () => {
  it("3つの見出し(できること・人数時間帯料金・流れ)を h2 で表示する", () => {
    renderWithIntl(<PrivateDetails />);
    for (const name of ["ご利用いただける内容", "人数・時間帯・料金", "ご利用の流れ"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
  });

  it("できること4項目を表示する", () => {
    renderWithIntl(<PrivateDetails />);
    for (const name of ["コートの貸切", "施設全体の貸切", "ショーコート形式", "設備"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
  });

  it("営業時間は site.ts の表記(6:00–25:00 / 6:00 AM–1:00 AM)を差し込む", () => {
    renderWithIntl(<PrivateDetails />);
    expect(screen.getByText(/営業時間 6:00–25:00\(毎日\)/)).toBeInTheDocument();
  });

  it("EN の営業時間は 12 時間表記", () => {
    renderWithIntl(<PrivateDetails />, "en");
    expect(screen.getByText(/6:00 AM–1:00 AM, every day/)).toBeInTheDocument();
  });

  it("料金は「お問い合わせください」とだけ案内する", () => {
    renderWithIntl(<PrivateDetails />);
    expect(screen.getByText(/^お問い合わせください。/)).toBeInTheDocument();
  });

  it("流れは番号付きの4ステップで表示する", () => {
    renderWithIntl(<PrivateDetails />);
    const steps = screen.getAllByRole("listitem").filter((li) => li.closest("ol"));
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent("01");
    expect(steps[0]).toHaveTextContent("お問い合わせ");
    expect(steps[3]).toHaveTextContent("ご利用");
  });

  it("電話番号・料金額・実績を示す語を出さない", () => {
    const { container } = renderWithIntl(<PrivateDetails />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d{2,4}-\d{2,4}-\d{3,4}/);
    expect(text).not.toMatch(/[¥￥]\s?\d|\d\s?円/);
    expect(text).not.toMatch(/実績|導入事例|企業イベント|大会利用/);
  });

  it("EN でも表示する", () => {
    renderWithIntl(<PrivateDetails />, "en");
    expect(
      screen.getByRole("heading", { level: 2, name: "How it works" }),
    ).toBeInTheDocument();
  });
});
