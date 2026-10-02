import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveInfo from "./ReserveInfo";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

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
    expect(screen.getByText("6:00 – 25:00（年中無休）")).toBeInTheDocument();
    expect(screen.getByText("本八幡駅 徒歩1分")).toBeInTheDocument();
  });

  it("営業時間に「不定休」を含めない", () => {
    renderWithIntl(<ReserveInfo />);
    expect(screen.queryByText(/不定休/)).not.toBeInTheDocument();
  });

  it("英語ロケールの営業時間は年中無休を示す", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ReserveInfo />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText("6:00 AM – 1:00 AM (open every day)")
    ).toBeInTheDocument();
    expect(screen.queryByText(/irregular/i)).not.toBeInTheDocument();
  });

  it("注意事項を6件表示する", () => {
    renderWithIntl(<ReserveInfo />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(6);
  });

  it("シャワー設備がない旨を案内する", () => {
    renderWithIntl(<ReserveInfo />);
    expect(
      screen.getByText("シャワー設備はございません。")
    ).toBeInTheDocument();
  });

  it("レンタルパドル・シューズの案内を表示する", () => {
    renderWithIntl(<ReserveInfo />);
    expect(
      screen.getByText("レンタルパドルは1本 ¥500（1コートにつき6本まで）でご利用いただけます。")
    ).toBeInTheDocument();
    expect(
      screen.getByText("レンタルシューズの貸出はございません。")
    ).toBeInTheDocument();
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
