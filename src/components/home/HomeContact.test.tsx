import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HomeContact from "./HomeContact";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("HomeContact", () => {
  it('セクションID "contact" を持つ', () => {
    render(<HomeContact />);
    const section = document.getElementById("contact");
    expect(section).toBeInTheDocument();
  });

  it("全フォームフィールドを表示する", () => {
    render(<HomeContact />);
    expect(screen.getByLabelText(/お名前/)).toBeInTheDocument();
    expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    expect(screen.getByLabelText(/お問い合わせ種別/)).toBeInTheDocument();
    expect(screen.getByLabelText(/お問い合わせ内容/)).toBeInTheDocument();
  });

  it("送信ボタンを表示する", () => {
    render(<HomeContact />);
    expect(
      screen.getByRole("button", { name: /SEND MESSAGE/ })
    ).toBeInTheDocument();
  });

  it("連絡先情報を表示する", () => {
    render(<HomeContact />);
    expect(screen.getByText(/GET IN TOUCH/)).toBeInTheDocument();
    expect(screen.getByText(/@thepicklebangtheory/)).toBeInTheDocument();
  });

  it("フォーム送信でfetchを呼ぶ", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<HomeContact />);

    await user.type(screen.getByLabelText(/お名前/), "テスト太郎");
    await user.type(
      screen.getByLabelText(/メールアドレス/),
      "test@example.com"
    );
    await user.selectOptions(screen.getByLabelText(/お問い合わせ種別/), "court");
    await user.type(screen.getByLabelText(/お問い合わせ内容/), "テストメッセージ");
    await user.click(screen.getByRole("button", { name: /SEND MESSAGE/ }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/contact",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(trackCtaClick).toHaveBeenCalledWith("contactSubmit", "home_contact", "court");
  });

  it("送信成功時に成功メッセージを表示する", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<HomeContact />);

    await user.type(screen.getByLabelText(/お名前/), "テスト太郎");
    await user.type(
      screen.getByLabelText(/メールアドレス/),
      "test@example.com"
    );
    await user.selectOptions(screen.getByLabelText(/お問い合わせ種別/), "court");
    await user.type(screen.getByLabelText(/お問い合わせ内容/), "テストメッセージ");
    await user.click(screen.getByRole("button", { name: /SEND MESSAGE/ }));

    await waitFor(() => {
      expect(screen.getByText(/送信しました/)).toBeInTheDocument();
    });
  });

  it("APIがエラーレスポンス(ok:false)を返した時にエラーメッセージを表示する", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false }),
    });

    render(<HomeContact />);

    await user.type(screen.getByLabelText(/お名前/), "テスト太郎");
    await user.type(
      screen.getByLabelText(/メールアドレス/),
      "test@example.com"
    );
    await user.selectOptions(screen.getByLabelText(/お問い合わせ種別/), "court");
    await user.type(screen.getByLabelText(/お問い合わせ内容/), "テストメッセージ");
    await user.click(screen.getByRole("button", { name: /SEND MESSAGE/ }));

    await waitFor(() => {
      expect(screen.getByText(/失敗/)).toBeInTheDocument();
    });
    expect(trackCtaClick).not.toHaveBeenCalled();
  });

  it("送信失敗時にエラーメッセージを表示する", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error")
    );

    render(<HomeContact />);

    await user.type(screen.getByLabelText(/お名前/), "テスト太郎");
    await user.type(
      screen.getByLabelText(/メールアドレス/),
      "test@example.com"
    );
    await user.selectOptions(screen.getByLabelText(/お問い合わせ種別/), "court");
    await user.type(screen.getByLabelText(/お問い合わせ内容/), "テストメッセージ");
    await user.click(screen.getByRole("button", { name: /SEND MESSAGE/ }));

    await waitFor(() => {
      expect(screen.getByText(/失敗/)).toBeInTheDocument();
    });
  });

  it("bg-deep-black 背景を持つ", () => {
    render(<HomeContact />);
    const section = document.getElementById("contact");
    expect(section?.className).toContain("bg-deep-black");
  });
});
