import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import jaMessages from "../../../messages/ja.json";
import PbtClubFaq from "./PbtClubFaq";

describe("PbtClubFaq", () => {
  it("見出しと質問・回答を表示する(日本語)", () => {
    renderWithIntl(<PbtClubFaq />);
    expect(
      screen.getByRole("heading", { level: 2, name: "よくある質問" }),
    ).toBeInTheDocument();
    expect(screen.getByText("会費はいくらですか？")).toBeInTheDocument();
    expect(screen.getByText("月額¥10,000（税込）です。")).toBeInTheDocument();
    expect(screen.getByText("会員料金は月に何時間まで使えますか？")).toBeInTheDocument();
    expect(screen.getByText("月20時間までです。")).toBeInTheDocument();
  });

  it("入会の回答は LaBOLA の入会ページで最新の条件を確認するよう案内する", () => {
    renderWithIntl(<PbtClubFaq />);
    expect(
      screen.getByText(
        "LaBOLA の入会ページからお手続きください。最新の条件・お手続きは入会ページでご確認ください。",
      ),
    ).toBeInTheDocument();
  });

  it("表示している Q&A と同じ内容の FAQPage 構造化データを出す", () => {
    const { container } = renderWithIntl(<PbtClubFaq />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script?.textContent ?? "{}") as {
      "@type": string;
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(6);
    expect(data.mainEntity[0]).toEqual({
      "@type": "Question",
      name: "会費はいくらですか？",
      acceptedAnswer: { "@type": "Answer", text: "月額¥10,000（税込）です。" },
    });
  });

  it("設問が空なら枠も構造化データも出さない", () => {
    const messages = {
      ...jaMessages,
      PbtClub: { ...jaMessages.PbtClub, faq: { heading: "よくある質問", items: [] } },
    };
    const { container } = render(
      <NextIntlClientProvider locale="ja" messages={messages as never}>
        <PbtClubFaq />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "よくある質問" })).toBeInTheDocument();
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
  });

  it("英語ロケールでも描画できる", () => {
    renderWithIntl(<PbtClubFaq />, { locale: "en" });
    expect(screen.getByText("How much is the membership fee?")).toBeInTheDocument();
  });
});
