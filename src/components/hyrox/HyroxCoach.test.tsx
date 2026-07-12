import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxCoach from "./HyroxCoach";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

describe("HyroxCoach", () => {
  it("セクションタイトル CREW を表示する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(screen.getByRole("heading", { name: "CREW" })).toBeInTheDocument();
  });

  it("コーチ名・紹介文・プロフィールを表示する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(
      screen.getByRole("heading", { name: "関吉大亮" })
    ).toBeInTheDocument();
    expect(screen.getByText(/HYROXの先駆者/)).toBeInTheDocument();
    expect(screen.getByText(/1985年6月25日生/)).toBeInTheDocument();
    expect(screen.getByText(/千葉県出身/)).toBeInTheDocument();
  });

  it("競技別の実績見出しを表示する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(screen.getByText("SPARTAN RACE")).toBeInTheDocument();
    expect(screen.getByText("TRIATHLON")).toBeInTheDocument();
  });

  it("主要な実績項目を表示する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(
      screen.getByText(/mix doubles age40〜44 世界7位/)
    ).toBeInTheDocument();
    expect(screen.getByText(/mix doubles over40 1位/)).toBeInTheDocument();
    expect(screen.getByText(/日本人男子初表彰台/)).toBeInTheDocument();
    expect(screen.getByText("初代日本チャンピオン")).toBeInTheDocument();
    expect(
      screen.getByText(/年間ランキング1位/)
    ).toBeInTheDocument();
  });

  it("経歴を表示する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(
      screen.getByText("千葉県警察官として22年間勤務")
    ).toBeInTheDocument();
    expect(screen.getByText(/2026年に退職/)).toBeInTheDocument();
  });

  it("英語ラベルに日本語表記を併記する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(screen.getByText("実績")).toBeInTheDocument();
    expect(screen.getByText("経歴")).toBeInTheDocument();
    expect(screen.getByText("ハイロックス")).toBeInTheDocument();
    expect(screen.getByText("スパルタンレース")).toBeInTheDocument();
    expect(screen.getByText("トライアスロン")).toBeInTheDocument();
  });

  it("Instagram への外部リンクを表示する", () => {
    renderWithIntl(<HyroxCoach />);
    const link = screen.getByRole("link", { name: /Instagram/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.instagram.com/tac_monk/"
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("Instagramクリックを計測する", async () => {
    trackCtaClick.mockClear();
    renderWithIntl(<HyroxCoach />);

    await userEvent.click(screen.getByRole("link", { name: /Instagram/ }));

    expect(trackCtaClick).toHaveBeenCalledWith(
      "instagram",
      "hyrox_coach",
      "coach",
    );
  });

  it("ポートレート画像に alt を設定する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(
      screen.getByAltText("HYROX担当コーチ 関吉大亮")
    ).toBeInTheDocument();
  });
});
