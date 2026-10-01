import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import FirstVisitFaq from "./FirstVisitFaq";

function faqJsonLd(container: HTMLElement) {
  const script = container.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script?.textContent ?? "{}") as {
    "@type": string;
    mainEntity: { name: string; acceptedAnswer: { text: string } }[];
  };
}

describe("FirstVisitFaq", () => {
  it("見出しと7問を details で表示する", () => {
    const { container } = renderWithIntl(<FirstVisitFaq />);
    expect(
      screen.getByRole("heading", { level: 2, name: "よくある質問" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(7);
    expect(screen.getByText("全員初心者でも大丈夫ですか?")).toBeInTheDocument();
  });

  it("受付開始日の回答は定数から埋まる", () => {
    renderWithIntl(<FirstVisitFaq />);
    const answers = screen.getAllByText(
      "一般のご予約は14日前から、PBT CLUB会員は30日前からです。",
    );
    expect(answers.length).toBeGreaterThan(0);
  });

  it("FAQPage 構造化データが表示中の Q&A と一致する", () => {
    const { container } = renderWithIntl(<FirstVisitFaq />);
    const data = faqJsonLd(container);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(7);
    expect(data.mainEntity[3].name).toBe("何日前から予約できますか?");
    expect(data.mainEntity[3].acceptedAnswer.text).toBe(
      "一般のご予約は14日前から、PBT CLUB会員は30日前からです。",
    );
    for (const entity of data.mainEntity) {
      expect(screen.getByText(entity.acceptedAnswer.text, { exact: true })).toBeInTheDocument();
    }
  });
});
