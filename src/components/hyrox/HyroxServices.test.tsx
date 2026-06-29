import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { LABOLA_RESERVE_URL } from "@/constants/site";
import HyroxServices from "./HyroxServices";
import jaMessages from "../../../messages/ja.json";

import type React from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

describe("HyroxServices", () => {
  it("SERVICES 見出しを表示する", () => {
    renderWithIntl(<HyroxServices />);
    expect(
      screen.getByRole("heading", { name: "SERVICES" })
    ).toBeInTheDocument();
  });

  it("3つのサービス（英字＋日本語）を表示する", () => {
    renderWithIntl(<HyroxServices />);
    expect(screen.getByText("AREA RENTAL")).toBeInTheDocument();
    expect(screen.getByText("TRIAL")).toBeInTheDocument();
    expect(screen.getByText("GROUP SESSION")).toBeInTheDocument();
    expect(screen.getByText("時間制レンタル")).toBeInTheDocument();
    expect(screen.getByText("体験・トライアル")).toBeInTheDocument();
    expect(screen.getByText("グループセッション")).toBeInTheDocument();
  });

  it("各サービスの予約が labola へ外部リンクする（3つ）", () => {
    renderWithIntl(<HyroxServices />);
    const links = screen.getAllByRole("link", { name: "予約する" });
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link).toHaveAttribute("href", LABOLA_RESERVE_URL);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("items が配列でない場合も見出しを描画する（フォールバック）", () => {
    const broken = structuredClone(jaMessages);
    (
      broken.HyroxPage.services as unknown as { items: unknown }
    ).items = "not-an-array";
    render(
      <NextIntlClientProvider locale="ja" messages={broken}>
        <HyroxServices />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "SERVICES" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("AREA RENTAL")).not.toBeInTheDocument();
  });
});
