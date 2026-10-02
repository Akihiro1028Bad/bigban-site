import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { EXTERNAL_LINK_PROPS, GOOGLE_BUSINESS_PROFILE_URL } from "@/constants/site";
import HyroxAccess from "./HyroxAccess";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

beforeEach(() => {
  trackCtaClick.mockClear();
});

describe("HyroxAccess", () => {
  it("h2 に ACCESS と アクセス を含む", () => {
    renderWithIntl(<HyroxAccess />);
    expect(
      screen.getByRole("heading", { level: 2, name: "ACCESS アクセス" }),
    ).toBeInTheDocument();
  });

  it("住所・3路線・営業時間・駐車の案内を表示する", () => {
    renderWithIntl(<HyroxAccess />);
    expect(screen.getByText("〒272-0021")).toBeInTheDocument();
    expect(
      screen.getByText("千葉県市川市八幡2-16-6 八幡ハタビル 6階"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("JR総武線")).toBeInTheDocument();
    expect(screen.getByText("都営新宿線")).toBeInTheDocument();
    expect(screen.getByText("京成本線")).toBeInTheDocument();
    expect(screen.getByText("徒歩1分")).toBeInTheDocument();
    expect(screen.getByText(/営業時間/)).toBeInTheDocument();
    expect(screen.getByText(/コインパーキング/)).toBeInTheDocument();
  });

  it("Google マップのリンクは別タブで開き、クリックを計測する", async () => {
    renderWithIntl(<HyroxAccess />);
    const link = screen.getByRole("link", { name: /Googleマップで開く/ });
    expect(link).toHaveAttribute("href", GOOGLE_BUSINESS_PROFILE_URL);
    expect(link).toHaveAttribute("target", EXTERNAL_LINK_PROPS.target);
    expect(link).toHaveAttribute("rel", EXTERNAL_LINK_PROPS.rel);
    expect(link).toHaveTextContent("新しいタブで開きます");
    await userEvent.click(link);
    expect(trackCtaClick).toHaveBeenCalledWith("access", "hyrox_access");
  });

  it("地図を埋め込まない", () => {
    const { container } = renderWithIntl(<HyroxAccess />);
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("英語表示", () => {
    renderWithIntl(<HyroxAccess />, { locale: "en" });
    expect(
      screen.getByRole("heading", { level: 2, name: "ACCESS Access" }),
    ).toBeInTheDocument();
    expect(screen.getByText("JR Sobu Line")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open in Google Maps/ }),
    ).toBeInTheDocument();
  });
});
