import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TrackedLink } from "./TrackedLink";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

describe("TrackedLink", () => {
  it("内部リンククリックを指定イベントで計測する", async () => {
    trackCtaClick.mockClear();
    render(
      <TrackedLink href="/reserve" eventKey="reserveEntry" location="home_hero">
        予約
      </TrackedLink>,
    );

    await userEvent.click(screen.getByRole("link", { name: "予約" }));

    expect(trackCtaClick).toHaveBeenCalledWith("reserveEntry", "home_hero", undefined);
  });

  it("外部リンククリックを指定イベントと label で計測する", async () => {
    trackCtaClick.mockClear();
    render(
      <TrackedLink
        href="https://example.com"
        eventKey="externalLink"
        location="article_body"
        label="Example"
        external
      >
        詳細
      </TrackedLink>,
    );

    await userEvent.click(screen.getByRole("link", { name: "詳細" }));

    expect(trackCtaClick).toHaveBeenCalledWith("externalLink", "article_body", "Example");
  });
});
