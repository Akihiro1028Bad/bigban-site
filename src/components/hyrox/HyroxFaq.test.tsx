import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { COURT_PRICES, HYROX_LESSON_PRICES } from "@/constants/pricing";
import { courtPriceRange } from "@/lib/pricing/courtPriceRange";
import HyroxFaq from "./HyroxFaq";

interface FaqJsonLd {
  "@type": string;
  mainEntity: {
    name: string;
    acceptedAnswer: { text: string };
  }[];
}

function readJsonLd(container: HTMLElement): FaqJsonLd {
  const script = container.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script?.textContent ?? "{}") as FaqJsonLd;
}

describe("HyroxFaq", () => {
  it("h2 に FAQ と よくある質問 を含む", () => {
    renderWithIntl(<HyroxFaq />);
    expect(
      screen.getByRole("heading", { level: 2, name: "FAQ よくある質問" }),
    ).toBeInTheDocument();
  });

  it("7つの質問を表示する", () => {
    const { container } = renderWithIntl(<HyroxFaq />);
    expect(container.querySelectorAll("details")).toHaveLength(7);
    expect(container.querySelectorAll("summary")).toHaveLength(7);
    expect(
      screen.getByText("ここはHYROX公式のトレーニングジムですか？"),
    ).toBeInTheDocument();
  });

  it("料金の回答は体験会と時間貸しの定数に一致する", () => {
    renderWithIntl(<HyroxFaq />);
    const { trial } = HYROX_LESSON_PRICES;
    const { min, max } = courtPriceRange(COURT_PRICES);
    const answer = screen.getByText(
      new RegExp(`体験会は${trial.minutes}分・${trial.priceYen.toLocaleString("ja-JP")}円です`),
    );
    expect(answer.textContent).toContain(`${min}〜${max}`);
    expect(answer.textContent).not.toMatch(/\{|\}/);
  });

  it("FAQPage の JSON-LD が表示文面と一致する", () => {
    const { container } = renderWithIntl(<HyroxFaq />);
    const json = readJsonLd(container);
    expect(json["@type"]).toBe("FAQPage");
    expect(json.mainEntity).toHaveLength(7);
    const details = Array.from(container.querySelectorAll("details"));
    json.mainEntity.forEach((entity, i) => {
      expect(entity.name).toBe(details[i].querySelector("summary")?.textContent?.replace(/＋$/, ""));
      expect(entity.acceptedAnswer.text).toBe(details[i].querySelector("p")?.textContent);
    });
  });

  it("営業時間が差し込まれ、未解決の差し込み口が残らない", () => {
    const { container } = renderWithIntl(<HyroxFaq />);
    expect(container.textContent).toContain("6:00〜25:00");
    expect(container.textContent).not.toMatch(/\{\w+\}/);
  });

  it("英語表示では英語の質問・JSON-LD を出す", () => {
    const { container } = renderWithIntl(<HyroxFaq />, {
      locale: "en",
    });
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "FAQ Frequently asked questions",
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(7);
    expect(container.textContent).toContain("6:00 AM");
    expect(container.textContent).not.toMatch(/\{\w+\}/);
    expect(readJsonLd(container).mainEntity).toHaveLength(7);
  });
});
