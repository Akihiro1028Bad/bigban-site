import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import PrivateHero from "./PrivateHero";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement, locale: "ja" | "en" = "ja") {
  const messages = locale === "ja" ? jaMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PrivateHero", () => {
  it("h1 に PRIVATE & CORPORATE と和文サブタイトル・リードを表示する", () => {
    renderWithIntl(<PrivateHero />);
    expect(
      screen.getByRole("heading", { level: 1, name: /PRIVATE & CORPORATE/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("貸切・法人利用")).toBeInTheDocument();
    expect(screen.getByText(/ご希望の日時とご人数をお知らせください/)).toBeInTheDocument();
  });

  it("EN でも表示する", () => {
    renderWithIntl(<PrivateHero />, "en");
    expect(screen.getByText("Private & Corporate Use")).toBeInTheDocument();
  });
});
