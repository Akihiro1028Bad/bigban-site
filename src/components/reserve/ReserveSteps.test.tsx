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
    expect(screen.getByText("コート・人数を選択")).toBeInTheDocument();
    expect(screen.getByText("予約完了（決済）")).toBeInTheDocument();
  });
});
