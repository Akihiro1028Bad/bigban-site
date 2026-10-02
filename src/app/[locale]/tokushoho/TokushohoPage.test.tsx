import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../../messages/ja.json";
import enMessages from "../../../../messages/en.json";

import TokushohoContent from "./TokushohoContent";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...rest}
        data-fill={fill ? "true" : undefined}
        data-priority={priority ? "true" : undefined}
      />
    );
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/tokushoho",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>{children as React.ReactNode}</a>
  ),
  usePathname: () => "/tokushoho",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.stubGlobal("IntersectionObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

function renderWithIntl(ui: React.ReactElement, locale = "ja") {
  const messages = locale === "ja" ? jaMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("TokushohoContent", () => {
  describe("日本語", () => {
    it("ページタイトルを表示する", () => {
      renderWithIntl(<TokushohoContent />);
      expect(
        screen.getByRole("heading", { name: "特定商取引法に基づく表記" })
      ).toBeInTheDocument();
    });

    it("販売者情報を表示する", () => {
      renderWithIntl(<TokushohoContent />);
      expect(screen.getByText("RST Agency株式会社")).toBeInTheDocument();
      expect(screen.getByText("西村昭彦")).toBeInTheDocument();
    });

    it("電話番号がtel:リンクとして表示される", () => {
      renderWithIntl(<TokushohoContent />);
      const link = screen.getByRole("link", { name: "090 5523 3879" });
      expect(link).toHaveAttribute("href", "tel:09055233879");
    });

    it("メールアドレスがmailto:リンクとして表示される", () => {
      renderWithIntl(<TokushohoContent />);
      const link = screen.getByRole("link", { name: "hello@rstagency.com" });
      expect(link).toHaveAttribute("href", "mailto:hello@rstagency.com");
    });

    it("ホームページURLを外部リンクとして表示する", () => {
      renderWithIntl(<TokushohoContent />);
      const link = screen.getByRole("link", { name: "https://rstagency.com" });
      expect(link).toHaveAttribute("href", "https://rstagency.com");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("予約のキャンセル・変更は LaBOLA の規定に従う旨を追記している", () => {
      renderWithIntl(<TokushohoContent />);
      expect(
        screen.getByText(
          /不良品以外不可。ただし、コート・イベントのご予約のキャンセル・変更は、予約システム（LaBOLA）に定める規定に従います。詳細は予約時にご確認ください。/
        )
      ).toBeInTheDocument();
      expect(screen.getByText("商品購入より2週間以内")).toBeInTheDocument();
      expect(
        screen.getByText("お客様にご負担いただきます")
      ).toBeInTheDocument();
    });

    it("全16項目が表示される", () => {
      renderWithIntl(<TokushohoContent />);
      const terms = screen.getAllByRole("term");
      expect(terms).toHaveLength(16);
    });

    it("フッターが表示される", () => {
      renderWithIntl(<TokushohoContent />);
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    });
  });

  describe("英語", () => {
    it("英語のタイトルを表示する", () => {
      renderWithIntl(<TokushohoContent />, "en");
      expect(
        screen.getByRole("heading", { name: "Specified Commercial Transactions Act" })
      ).toBeInTheDocument();
    });

    it("英語でも予約のキャンセル・変更は LaBOLA の規定に従う旨を追記している", () => {
      renderWithIntl(<TokushohoContent />, "en");
      expect(
        screen.getByText(
          /Not accepted except for defective products\. Cancellations and changes to court and event bookings follow the rules set by the booking system \(LaBOLA\); please check the details when you book\./
        )
      ).toBeInTheDocument();
    });

    it("英語の販売者情報を表示する", () => {
      renderWithIntl(<TokushohoContent />, "en");
      expect(screen.getByText("RST Agency Inc.")).toBeInTheDocument();
      expect(screen.getByText("Akihiko Nishimura")).toBeInTheDocument();
    });
  });
});
