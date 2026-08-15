import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveFaq from "./ReserveFaq";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement, messages: unknown = jaMessages) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as never}>
      {ui}
    </NextIntlClientProvider>,
  );
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
        "コート利用・イベント/スクール・HYROXエリア・レッスン/クラスの中から、ご利用内容に合うものをお選びください。日時の指定とお申し込みは、予約システムのページで行えます。",
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
    renderWithIntl(<ReserveFaq />, broken);
    expect(screen.getByText("よくある質問")).toBeInTheDocument();
    expect(screen.queryByText("営業時間は？")).not.toBeInTheDocument();
  });
});
