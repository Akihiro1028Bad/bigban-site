import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import HomeLead from "./HomeLead";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("HomeLead", () => {
  it("施設を説明するリード文を本文として表示する", () => {
    renderWithIntl(<HomeLead />);
    expect(screen.getByText(jaMessages.HomeLead.body)).toBeInTheDocument();
  });

  it("meta description を裏付ける確定情報を含む", () => {
    renderWithIntl(<HomeLead />);
    const body = jaMessages.HomeLead.body;
    // 検索スニペット対策として、description と同じ事実が本文側にあることを担保する。
    for (const fact of ["本八幡駅", "徒歩1分", "DecoTurf", "6:00", "23:00"]) {
      expect(body).toContain(fact);
    }
  });

  it("キッカーを表示する", () => {
    renderWithIntl(<HomeLead />);
    expect(screen.getByText(jaMessages.HomeLead.kicker)).toBeInTheDocument();
  });

  it("隠しテキストにしない（読める本文として描画する）", () => {
    const { container } = renderWithIntl(<HomeLead />);
    const section = container.querySelector("section");
    expect(section?.className).not.toContain("hidden");
    expect(section?.className).not.toContain("sr-only");
  });
});
