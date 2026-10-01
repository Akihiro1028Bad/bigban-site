import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import ReserveVisitorGuide from "./ReserveVisitorGuide";

describe("ReserveVisitorGuide", () => {
  it("ビジター予約で会員登録が不要なことを見出しで伝える", () => {
    renderWithIntl(<ReserveVisitorGuide />);
    expect(
      screen.getByRole("heading", { level: 2, name: /会員登録は不要/ }),
    ).toBeInTheDocument();
  });

  it("予約の流れを3段の順序つきリストで示す", () => {
    renderWithIntl(<ReserveVisitorGuide />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("日付と空いている枠を選ぶ");
    expect(items[1]).toHaveTextContent("「ビジターで予約」");
    expect(items[2]).toHaveTextContent("予約内容と連絡先を入力して確定");
  });

  it("会員登録(無料)の手前でメール未着の確認事項を案内する", () => {
    renderWithIntl(<ReserveVisitorGuide />);
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "会員登録（無料）をされる方へ",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/迷惑メールフォルダ/)).toBeInTheDocument();
    expect(screen.getByText(/先にビジターで予約を進めることもできます/)).toBeInTheDocument();
  });

  it("システム名・所要時間・決済手段・PBT Club の登録料を書かない", () => {
    const { container } = renderWithIntl(<ReserveVisitorGuide />);
    expect(container.textContent).not.toMatch(/labola|reserva/i);
    expect(container.textContent).not.toMatch(
      /\d+\s*分|クレジット|PayPay|PBT\s*CLUB|10,000/i,
    );
  });

  it("英語でも描画できる", () => {
    renderWithIntl(<ReserveVisitorGuide />, { locale: "en" });
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /no membership needed/i,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
