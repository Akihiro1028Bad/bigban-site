import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { COURT_PRICES } from "@/constants/pricing";
import ReserveFaq from "./ReserveFaq";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

function renderWithIntl(
  ui: ReactElement,
  { messages = jaMessages as unknown, locale = "ja" } = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages as never}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** "¥4,980" → 4980。料金表の表記から数値レンジを導くための変換。 */
function toAmount(price: string): number {
  return Number(price.replace(/[^0-9]/g, ""));
}

function formatAmount(amount: number): string {
  return `¥${amount.toLocaleString("en-US")}`;
}

/** 会費と適用上限(¥10,000 / 20時間)を HomePricing の凡例から取り出す。 */
function membershipFacts(): string[] {
  const legend = jaMessages.HomePricing.memberLegend;
  const fee = legend.match(/¥[\d,]+/)?.[0];
  const hours = legend.match(/月(\d+)時間/)?.[1];
  if (!fee || !hours) throw new Error("memberLegend から会費/上限を読めない");
  return [fee, hours];
}

function priceRange(pick: (row: (typeof COURT_PRICES)[number]) => string[]) {
  const amounts = COURT_PRICES.flatMap(pick).map(toAmount);
  return {
    min: formatAmount(Math.min(...amounts)),
    max: formatAmount(Math.max(...amounts)),
  };
}

describe("ReserveFaq", () => {
  it("見出しと質問・回答を表示する", () => {
    renderWithIntl(<ReserveFaq />);
    expect(screen.getByText("よくある質問")).toBeInTheDocument();
    expect(screen.getByText("営業時間は？")).toBeInTheDocument();
    expect(
      screen.getByText("早朝6:00から深夜23:00まで営業しています。"),
    ).toBeInTheDocument();
  });

  it("コートレンタル料金の回答に会員価格と HYROX エリアの同一料金を明記する", () => {
    renderWithIntl(<ReserveFaq />);
    expect(
      screen.getByText(
        "時間帯・曜日により、1時間あたり ¥4,980〜¥7,980 です。月額¥10,000（税込）の会員制度「PBT CLUB」の会員価格なら ¥3,500〜¥5,600（月20時間まで）。HYROXエリアの利用料も同額です（4名まで／5名目以降は1名につき+¥1,000）。",
      ),
    ).toBeInTheDocument();
  });

  it("予約方法の回答が現行の4つの予約先を案内する", () => {
    renderWithIntl(<ReserveFaq />);
    expect(
      screen.getByText(
        "コート利用・イベント/スクール・HYROXエリア・レッスン/クラスの中から、ご利用内容に合うものをお選びください。お申し込みは、それぞれの予約ページで行えます。",
      ),
    ).toBeInTheDocument();
  });

  it("支払い方法の回答がクレジットカードと PayPay を案内する", () => {
    renderWithIntl(<ReserveFaq />);
    expect(
      screen.getByText(
        "クレジットカード・PayPay がご利用いただけます。",
      ),
    ).toBeInTheDocument();
  });

  it.each([
    { locale: "ja", messages: jaMessages as unknown, match: /1時間あたり/ },
    { locale: "en", messages: enMessages as unknown, match: /per hour/ },
  ])(
    "$locale の料金の回答が COURT_PRICES と会員制度の表記に一致する",
    ({ locale, messages, match }) => {
      renderWithIntl(<ReserveFaq />, { messages, locale });
      const standard = priceRange((row) => [row.weekday, row.weekend]);
      const member = priceRange((row) => [row.weekdayMember, row.weekendMember]);
      const answer = screen.getByText(match).textContent ?? "";

      for (const price of [standard.min, standard.max, member.min, member.max]) {
        expect(answer).toContain(price);
      }
      // 会費と適用上限は HomePricing の凡例が正。FAQ 側の数字がずれたら落とす。
      for (const fact of membershipFacts()) {
        expect(answer).toContain(fact);
      }
    },
  );

  it("英語ロケールで更新した予約方法・支払い方法の回答を表示する", () => {
    renderWithIntl(<ReserveFaq />, { messages: enMessages, locale: "en" });
    expect(
      screen.getByText(
        "Choose the option that matches what you'd like to do — court rental, events and school sessions, the HYROX area, or lessons and classes. You'll complete your booking on the reservation page for that option.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Credit cards and PayPay are accepted."),
    ).toBeInTheDocument();
  });

  it("FAQPage 構造化データ(JSON-LD)を出力する", () => {
    const { container } = renderWithIntl(<ReserveFaq />);
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(script).not.toBeNull();
    expect(script?.textContent ?? "").toContain("FAQPage");
    expect(script?.textContent ?? "").toContain("営業時間は？");
  });

  it("items が配列でない場合も見出しのみ描画する（フォールバック）", () => {
    const broken = structuredClone(jaMessages);
    (
      broken.Reserve.faq as unknown as { items: unknown }
    ).items = "not-an-array";
    renderWithIntl(<ReserveFaq />, { messages: broken });
    expect(screen.getByText("よくある質問")).toBeInTheDocument();
    expect(screen.queryByText("営業時間は？")).not.toBeInTheDocument();
  });
});
