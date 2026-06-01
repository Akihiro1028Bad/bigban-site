import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveHero from "./ReserveHero";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("ReserveHero", () => {
  it("h1 見出し RESERVE を表示する", () => {
    renderWithIntl(<ReserveHero />);
    expect(
      screen.getByRole("heading", { level: 1, name: /RESERVE/ })
    ).toBeInTheDocument();
  });

  it("和文サブタイトルとリード文を表示する", () => {
    renderWithIntl(<ReserveHero />);
    expect(screen.getByText("コート予約")).toBeInTheDocument();
    expect(
      screen.getByText(
        "ご希望の日時を選んで、オンラインでかんたんにコートを予約できます。"
      )
    ).toBeInTheDocument();
  });
});
