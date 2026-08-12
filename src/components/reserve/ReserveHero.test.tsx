import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ReserveHero from "./ReserveHero";
import jaMessages from "../../../messages/ja.json";

import type { ReactElement } from "react";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("ReserveHero", () => {
  it("h1 見出し RESERVE を表示する", () => {
    renderWithIntl(<ReserveHero />);
    expect(
      screen.getByRole("heading", { level: 1, name: /RESERVE/ })
    ).toBeInTheDocument();
  });

  it("和文サブタイトルを表示する", () => {
    renderWithIntl(<ReserveHero />);
    expect(screen.getByText("コート予約")).toBeInTheDocument();
  });
});

/**
 * issue #404: 320px では px-6 の内側が 272px しかなく、48px の RESERVE が
 * 枠を超えてページに横スクロールを出す。ホームのセクション見出しと同じ
 * 流体サイズに揃える(375px 以上は 3rem = 旧 text-5xl のまま)。
 */
const FLUID_SECTION_HEADING = "text-[clamp(2rem,22vw_-_34.5px,3rem)]";

describe("ReserveHero の見出し級数", () => {
  it("sm 未満は固定の text-5xl ではなく下限付きの流体サイズを使う", () => {
    renderWithIntl(<ReserveHero />);
    const heading = screen.getByRole("heading", { level: 1, name: /RESERVE/ });
    const classes = heading.className.split(/\s+/);

    expect(classes).not.toContain("text-5xl");
    expect(classes).toContain(FLUID_SECTION_HEADING);
    expect(classes).toContain("leading-none");
    expect(classes).toContain("sm:text-7xl");
    expect(classes).toContain("lg:text-8xl");
  });
});
