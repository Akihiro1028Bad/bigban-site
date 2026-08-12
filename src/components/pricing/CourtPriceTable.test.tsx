import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import CourtPriceTable from "./CourtPriceTable";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

/**
 * 会員価格はラベル span と金額 span に分かれている（狭い画面でラベル／金額の
 * 途中改行を防ぐため）。getByText の既定マッチャは直下のテキストノードしか見ないので、
 * 「ラベル + 金額」の組み合わせは要素全体の textContent で照合する。
 */
function memberPrice(text: string) {
  return (_content: string, element: Element | null): boolean =>
    element?.tagName === "SPAN" &&
    element.textContent?.replace(/\s+/g, " ").trim() === text;
}

describe("CourtPriceTable", () => {
  beforeEach(() => {
    trackCtaClick.mockClear();
  });

  it("label 未指定時は COURT RENTAL 見出しを表示する", () => {
    renderWithIntl(<CourtPriceTable pbtClubLocation="home_pricing_pbt_club" />);
    expect(screen.getByText("COURT RENTAL")).toBeInTheDocument();
  });

  it("label 指定時はその見出しを表示する", () => {
    renderWithIntl(
      <CourtPriceTable label="エリア利用料" pbtClubLocation="hyrox_program_pbt_club" />,
    );
    expect(screen.getByText("エリア利用料")).toBeInTheDocument();
    expect(screen.queryByText("COURT RENTAL")).not.toBeInTheDocument();
  });

  it("通常料金を表示する", () => {
    renderWithIntl(<CourtPriceTable pbtClubLocation="home_pricing_pbt_club" />);
    expect(screen.getByText("¥4,980")).toBeInTheDocument();
    expect(screen.getByText("¥5,980")).toBeInTheDocument();
    expect(screen.getAllByText("¥7,980")).toHaveLength(4);
  });

  it("平日の会員価格 ¥3,500 / ¥4,200 / ¥5,600 を表示する", () => {
    renderWithIntl(<CourtPriceTable pbtClubLocation="home_pricing_pbt_club" />);
    expect(screen.getByText(memberPrice("PBT CLUB会員 ¥3,500"))).toBeInTheDocument();
    expect(screen.getByText(memberPrice("PBT CLUB会員 ¥4,200"))).toBeInTheDocument();
    // 平日 17:00-23:00 の1件 + 土日祝の3件
    expect(screen.getAllByText(memberPrice("PBT CLUB会員 ¥5,600"))).toHaveLength(4);
  });

  it("英語ロケールでは PBT CLUB member ラベルで会員価格を表示する", () => {
    renderWithIntl(<CourtPriceTable pbtClubLocation="home_pricing_pbt_club" />, {
      locale: "en",
    });
    expect(
      screen.getByText(memberPrice("PBT CLUB member ¥3,500")),
    ).toBeInTheDocument();
  });

  it("ラベルと金額は別 span で、それぞれ途中改行しない", () => {
    renderWithIntl(<CourtPriceTable pbtClubLocation="home_pricing_pbt_club" />);
    // 3行 × 平日/週末の6セル分。ラベル・金額とも whitespace-nowrap で保護する。
    const labels = screen.getAllByText("PBT CLUB会員");
    expect(labels).toHaveLength(6);
    for (const label of labels) {
      expect(label.className).toContain("whitespace-nowrap");
    }
    const memberAmount = screen.getByText("¥4,200");
    expect(memberAmount.className).toContain("whitespace-nowrap");
  });

  it("時間帯セルは途中改行しない", () => {
    renderWithIntl(<CourtPriceTable pbtClubLocation="home_pricing_pbt_club" />);
    // 会員価格で料金列が広がるため、時間帯が「6:00-」「9:00」に割れるのを防ぐ。
    for (const timeSlot of ["6:00-9:00", "9:00-17:00", "17:00-23:00"]) {
      expect(screen.getByText(timeSlot).className).toContain(
        "whitespace-nowrap",
      );
    }
  });

  it("会員制度の条件（月額・月20時間まで）を凡例で表示する", () => {
    renderWithIntl(<CourtPriceTable pbtClubLocation="home_pricing_pbt_club" />);
    expect(
      screen.getByText(
        "会員価格は月額¥10,000（税込）の会員制度「PBT CLUB」の料金です。適用は月20時間まで。",
      ),
    ).toBeInTheDocument();
  });

  it("PBT CLUB 詳細記事へのリンクを表示する", () => {
    renderWithIntl(<CourtPriceTable pbtClubLocation="home_pricing_pbt_club" />);
    const link = screen.getByRole("link", {
      name: /PBT CLUBについて詳しく見る/,
    });
    expect(link).toHaveAttribute("href", "/news/pbt-club-membership");
  });

  it("詳細リンククリックで contentClick を pbtClubLocation 付きで計測する", async () => {
    renderWithIntl(<CourtPriceTable pbtClubLocation="home_pricing_pbt_club" />);
    const link = screen.getByRole("link", {
      name: /PBT CLUBについて詳しく見る/,
    });
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "home_pricing_pbt_club",
      "pbt-club",
    );
  });

  it("pbtClubLocation は呼び出し側の値がそのまま計測に使われる", async () => {
    renderWithIntl(
      <CourtPriceTable label="エリア利用料" pbtClubLocation="hyrox_program_pbt_club" />,
    );
    const link = screen.getByRole("link", {
      name: /PBT CLUBについて詳しく見る/,
    });
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "hyrox_program_pbt_club",
      "pbt-club",
    );
  });
});
