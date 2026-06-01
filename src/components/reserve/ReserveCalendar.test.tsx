import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveCalendar from "./ReserveCalendar";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("ReserveCalendar", () => {
  it("labola shop 3453 の埋め込み iframe を表示する", () => {
    renderWithIntl(<ReserveCalendar />);
    const iframe = screen.getByTitle("予約カレンダー");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      "src",
      "https://yoyaku.labola.jp/r/shop/3453/calendar/?embed=normal&tab_name=%E3%81%99%E3%81%B9%E3%81%A6"
    );
  });

  it("見出し BOOK A COURT を表示する", () => {
    renderWithIntl(<ReserveCalendar />);
    expect(screen.getByText("BOOK A COURT")).toBeInTheDocument();
  });
});
