import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import CrowdfundingPopup from "./CrowdfundingPopup";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

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

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

function renderWithIntl(ui: ReactElement, locale: "ja" | "en" = "ja") {
  const messages = locale === "ja" ? jaMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const CAMPFIRE_URL =
  "https://camp-fire.jp/projects/926247/view?utm_campaign=cp_po_share_c_msg_mypage_projects_show";

describe("CrowdfundingPopup", () => {
  it("isOpen=trueでダイアログが表示される", () => {
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("クラファン実施中！")).toBeInTheDocument();
    expect(
      screen.getByText(
        "PBTを一緒に育て上げてくれる方、盛り上げてくれる方を募集します"
      )
    ).toBeInTheDocument();
  });

  it("ボーナス文言 (6月も30%OFF + さらに割引) が role=status で表示される (a11y)", () => {
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={vi.fn()} />);
    const bonus = screen.getByText("6月も30%OFF🔥さらに割引も！");
    expect(bonus).toBeInTheDocument();
    // 強調情報なのでスクリーンリーダーに「ステータス」として通知する
    expect(bonus).toHaveAttribute("role", "status");
  });

  it("EN ロケールでボーナス文言が英語で表示される", () => {
    renderWithIntl(
      <CrowdfundingPopup isOpen={true} onClose={vi.fn()} />,
      "en",
    );
    expect(
      screen.getByText(/30% OFF in June/i),
    ).toBeInTheDocument();
  });

  it("isOpen=falseでダイアログが非表示", () => {
    renderWithIntl(<CrowdfundingPopup isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("閉じるボタンクリックでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("閉じる"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("背景クリックでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("crowdfunding-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ESCキーでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ESC以外のキーではonCloseが呼ばれない", () => {
    const onClose = vi.fn();
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("モーダル表示時に閉じるボタンにフォーカスが移る", () => {
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={vi.fn()} />);
    const closeButton = screen.getByLabelText("閉じる");
    expect(document.activeElement).toBe(closeButton);
  });

  it("Tabキーでフォーカスがダイアログ内にトラップされる", () => {
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={vi.fn()} />);
    const closeButton = screen.getByLabelText("閉じる");
    const ctaLink = screen.getByRole("link", { name: /CAMP-FIRE/ });

    // 最後の要素からTabで最初に戻る
    (ctaLink as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    // 最初の要素からShift+Tabで最後に戻る
    closeButton.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(ctaLink);
  });

  it("中間のフォーカス可能要素でTabキーは通常遷移する", () => {
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={vi.fn()} />);
    const closeButton = screen.getByLabelText("閉じる");

    // 中間要素（最初でも最後でもない）でTabしてもpreventDefaultされない
    closeButton.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    const preventSpy = vi.spyOn(event, "preventDefault");
    document.dispatchEvent(event);
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it("CTAリンクがCAMP-FIRE URLを持つ", () => {
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={vi.fn()} />);
    const ctaLink = screen.getByRole("link", { name: /CAMP-FIRE/ });
    expect(ctaLink).toHaveAttribute("href", CAMPFIRE_URL);
    expect(ctaLink).toHaveAttribute("target", "_blank");
    expect(ctaLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("CTAクリックを external_link_click として計測する", () => {
    trackCtaClick.mockClear();
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("link", { name: /CAMP-FIRE/ }));

    expect(trackCtaClick).toHaveBeenCalledWith(
      "externalLink",
      "crowdfunding_popup",
      "campfire",
    );
  });

  it("aria-modal, role=dialog, aria-labelledbyが設定されている", () => {
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "crowdfunding-title");
    expect(screen.getByText("クラファン実施中！")).toHaveAttribute(
      "id",
      "crowdfunding-title"
    );
  });

  it("クラファン画像が表示される", () => {
    renderWithIntl(<CrowdfundingPopup isOpen={true} onClose={vi.fn()} />);
    const img = screen.getByAltText(
      "THE PICKLE BANG THEORY クラウドファンディング"
    );
    expect(img).toBeInTheDocument();
  });

  it("ENロケールで英語テキストが表示される", () => {
    renderWithIntl(
      <CrowdfundingPopup isOpen={true} onClose={vi.fn()} />,
      "en"
    );
    expect(screen.getByText("Crowdfunding Now Live!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /CAMP-FIRE/ })).toBeInTheDocument();
  });
});
