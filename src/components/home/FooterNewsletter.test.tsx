import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";

import FooterNewsletter from "./FooterNewsletter";

const fetchMock = vi.fn();

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      <FooterNewsletter />
    </NextIntlClientProvider>,
  );
}

describe("FooterNewsletter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("見出しとフォームを表示する", () => {
    renderWithIntl();
    expect(screen.getByRole("heading", { name: /Newsletter/i })).toBeInTheDocument();
    expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /登録/ })).toBeInTheDocument();
  });

  it("メールを入力できる", () => {
    renderWithIntl();
    const input = screen.getByLabelText("メールアドレス") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test@example.com" } });
    expect(input.value).toBe("test@example.com");
  });

  it("submit 成功時に成功メッセージを表示する", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderWithIntl();

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /登録/ }));

    await waitFor(() => {
      expect(screen.getByText(/登録が完了/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/subscribe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("submit 失敗時にエラーメッセージを表示する", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderWithIntl();

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /登録/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/登録に失敗/);
    });
  });
});
