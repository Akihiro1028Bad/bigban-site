import { render } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import GoogleAnalyticsTag from "./GoogleAnalyticsTag";
import { GA_MEASUREMENT_ID } from "@/constants/analytics";

vi.mock("@next/third-parties/google", () => ({
  GoogleAnalytics: ({ gaId }: { gaId: string }) => (
    <div data-testid="ga4" data-ga-id={gaId} />
  ),
}));

describe("GoogleAnalyticsTag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("測定IDは取得済みの G-XEP1C5L70P である", () => {
    expect(GA_MEASUREMENT_ID).toBe("G-XEP1C5L70P");
  });

  it("本番環境(VERCEL_ENV=production)では測定IDを指定してGA4タグを描画する", () => {
    vi.stubEnv("VERCEL_ENV", "production");

    const { getByTestId } = render(<GoogleAnalyticsTag />);

    expect(getByTestId("ga4").getAttribute("data-ga-id")).toBe(
      GA_MEASUREMENT_ID
    );
  });

  it("Preview環境では何も描画しない", () => {
    vi.stubEnv("VERCEL_ENV", "preview");

    const { queryByTestId } = render(<GoogleAnalyticsTag />);

    expect(queryByTestId("ga4")).toBeNull();
  });

  it("環境変数が未設定(ローカル開発)では何も描画しない", () => {
    vi.stubEnv("VERCEL_ENV", "");

    const { queryByTestId } = render(<GoogleAnalyticsTag />);

    expect(queryByTestId("ga4")).toBeNull();
  });
});
