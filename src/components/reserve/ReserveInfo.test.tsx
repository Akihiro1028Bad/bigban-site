import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveInfo from "./ReserveInfo";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("ReserveInfo", () => {
  it("営業時間とアクセスを表示する", () => {
    renderWithIntl(<ReserveInfo />);
    expect(screen.getByText("6:00 – 23:00（不定休）")).toBeInTheDocument();
    expect(screen.getByText("本八幡駅 徒歩1分")).toBeInTheDocument();
  });

  it("注意事項を3件表示する", () => {
    renderWithIntl(<ReserveInfo />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("notes.items が配列でない場合は注意事項を描画しない", () => {
    const brokenMessages = JSON.parse(
      JSON.stringify(jaMessages)
    ) as typeof jaMessages;
    (brokenMessages.Reserve.notes as unknown as { items: unknown }).items =
      "not-an-array";

    render(
      <NextIntlClientProvider locale="ja" messages={brokenMessages}>
        <ReserveInfo />
      </NextIntlClientProvider>
    );

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
