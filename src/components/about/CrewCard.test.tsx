import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import CrewCard from "./CrewCard";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";
import type { CrewMember } from "./CrewCard";

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

const mockMember: CrewMember = {
  name: "勝間田靖子 / Yasuko the Pickleballer",
  ig: "@yasuko_the_pickleballer",
  image: "/images/crew-yasuko.jpg",
  imageAlt: "勝間田靖子 / Yasuko the Pickleballer",
};

describe("CrewCard", () => {
  it("メンバー情報付きでカードを表示する", () => {
    renderWithIntl(<CrewCard member={mockMember} />);
    expect(screen.getByText("勝間田靖子 / Yasuko the Pickleballer")).toBeInTheDocument();
    expect(screen.getByAltText("勝間田靖子 / Yasuko the Pickleballer")).toBeInTheDocument();
  });

  it("Instagramリンクを表示する", () => {
    renderWithIntl(<CrewCard member={mockMember} />);
    const link = screen.getByRole("link", { name: /@yasuko_the_pickleballer/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.instagram.com/yasuko_the_pickleballer/"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("Instagramクリックを計測する", async () => {
    trackCtaClick.mockClear();
    renderWithIntl(<CrewCard member={mockMember} />);

    await userEvent.click(screen.getByRole("link", { name: /@yasuko_the_pickleballer/ }));

    expect(trackCtaClick).toHaveBeenCalledWith(
      "instagram",
      "about_crew",
      "@yasuko_the_pickleballer",
    );
  });

  it("Instagramがない場合はリンクを表示しない", () => {
    const memberNoIg: CrewMember = { name: "テストクルー" };
    renderWithIntl(<CrewCard member={memberNoIg} />);
    expect(screen.getByText("テストクルー")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("画像がない場合はプレースホルダーを表示する", () => {
    const memberNoImage: CrewMember = { name: "テストクルー" };
    renderWithIntl(<CrewCard member={memberNoImage} />);
    expect(screen.getByText("Photo")).toBeInTheDocument();
  });

  it("memberがundefinedの場合はComing Soonプレースホルダーを表示する", () => {
    renderWithIntl(<CrewCard />);
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
    expect(screen.getByText("Photo")).toBeInTheDocument();
  });

  it("ENロケールでComing Soonが表示される", () => {
    renderWithIntl(<CrewCard />, "en");
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
  });

  it("imageAltが未指定の場合はnameをaltに使う", () => {
    const memberNoAlt: CrewMember = {
      name: "テストクルー",
      image: "/images/test.jpg",
    };
    renderWithIntl(<CrewCard member={memberNoAlt} />);
    expect(screen.getByAltText("テストクルー")).toBeInTheDocument();
  });
});
