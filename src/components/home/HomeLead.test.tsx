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

/** メッセージのリッチテキストタグを除いた、描画される本文を得る。 */
function plainText(message: string): string {
  return message.replace(/<\/?strong>/g, "");
}

describe("HomeLead", () => {
  it("施設を説明するリード文を本文として表示する", () => {
    const { container } = renderWithIntl(<HomeLead />);
    const section = container.querySelector("section");
    expect(section?.textContent).toContain(plainText(jaMessages.HomeLead.body));
  });

  it("meta description を裏付ける確定情報を含む", () => {
    renderWithIntl(<HomeLead />);
    const body = `${jaMessages.HomeLead.body}${jaMessages.HomeLead.bodyHyrox}`;
    // 検索スニペット対策として、description と同じ事実が本文側にあることを担保する。
    for (const fact of ["本八幡駅", "徒歩1分", "DecoTurf", "6:00", "23:00", "HYROX"]) {
      expect(body).toContain(fact);
    }
  });

  it("ブランド名を strong 要素で強調する", () => {
    const { container } = renderWithIntl(<HomeLead />);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toContain("THE PICKLE BANG THEORY");
  });

  it("HYROX の説明を本文とは別の段落で表示する", () => {
    const { container } = renderWithIntl(<HomeLead />);
    const paragraphs = Array.from(container.querySelectorAll("p"));
    const hyroxParagraph = paragraphs.find((p) =>
      p.textContent?.includes(jaMessages.HomeLead.bodyHyrox)
    );
    const bodyParagraph = paragraphs.find((p) =>
      p.textContent?.includes(plainText(jaMessages.HomeLead.body))
    );
    expect(hyroxParagraph).toBeDefined();
    expect(bodyParagraph).toBeDefined();
    expect(hyroxParagraph).not.toBe(bodyParagraph);
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
