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

/** メッセージのリッチテキストタグ（strong / nb）を除いた、描画される本文を得る。 */
function plainText(message: string): string {
  return message.replace(/<\/?(?:strong|nb)>/g, "");
}

describe("HomeLead", () => {
  it("施設を説明するデッキ（第1文）を本文として表示する", () => {
    const { container } = renderWithIntl(<HomeLead />);
    const section = container.querySelector("section");
    expect(section?.textContent).toContain(plainText(jaMessages.HomeLead.deck));
  });

  it("meta description を裏付ける確定情報を含む", () => {
    renderWithIntl(<HomeLead />);
    const body = plainText(
      `${jaMessages.HomeLead.deck}${jaMessages.HomeLead.body}${jaMessages.HomeLead.bodyHyrox}`
    );
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

  it("デッキ・本文・HYROX の説明をそれぞれ別の段落で表示する", () => {
    const { container } = renderWithIntl(<HomeLead />);
    const paragraphs = Array.from(container.querySelectorAll("p"));
    const deckParagraph = paragraphs.find((p) =>
      p.textContent?.includes(plainText(jaMessages.HomeLead.deck))
    );
    const bodyParagraph = paragraphs.find((p) =>
      p.textContent?.includes(plainText(jaMessages.HomeLead.body))
    );
    const hyroxParagraph = paragraphs.find((p) =>
      p.textContent?.includes(plainText(jaMessages.HomeLead.bodyHyrox))
    );
    expect(deckParagraph).toBeDefined();
    expect(bodyParagraph).toBeDefined();
    expect(hyroxParagraph).toBeDefined();
    expect(deckParagraph).not.toBe(bodyParagraph);
    expect(bodyParagraph).not.toBe(hyroxParagraph);
  });

  it("スパインの縦書きラベルを全ブレークポイントで表示する", () => {
    renderWithIntl(<HomeLead />);
    const label = screen.getByText(jaMessages.HomeLead.sideLabel);
    expect(label).toBeInTheDocument();

    // hidden / sr-only で消していないことを、ラベル自身と祖先までさかのぼって担保する。
    let node: HTMLElement | null = label;
    while (node) {
      expect(node.className).not.toContain("hidden");
      expect(node.className).not.toContain("sr-only");
      node = node.parentElement;
    }
  });

  it("本文・HYROX 段落の nb タグを折り返し禁止スパンとして描画する", () => {
    const { container } = renderWithIntl(<HomeLead />);
    const nowrapTexts = Array.from(
      container.querySelectorAll("span.whitespace-nowrap")
    ).map((span) => span.textContent);

    // 実測で語中分断が起きた語だけを nb で守っている（表示テキストは変えない）。
    for (const phrase of [
      "ハードコート",
      "空調完備",
      "全天候型",
      "プレーできます。",
      "トレーニングエリア",
    ]) {
      expect(nowrapTexts).toContain(phrase);
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
