import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { isHyroxCampaignActive } from "@/lib/promoSchedule";
import HyroxCampaign from "./HyroxCampaign";

vi.mock("@/lib/promoSchedule", () => ({
  isHyroxCampaignActive: vi.fn(),
}));

const mockActive = vi.mocked(isHyroxCampaignActive);

describe("HyroxCampaign", () => {
  beforeEach(() => {
    mockActive.mockReset();
  });

  it("キャンペーン期間中は banner でタイトルと期間を表示する", () => {
    mockActive.mockReturnValue(true);
    renderWithIntl(<HyroxCampaign variant="banner" />);
    expect(
      screen.getByText(/オープン記念＆千葉大会応援キャンペーン/),
    ).toBeInTheDocument();
    expect(screen.getByText(/〜8\/9/)).toBeInTheDocument();
  });

  it("note バリアントでは料金がキャンペーン価格である旨も表示する", () => {
    mockActive.mockReturnValue(true);
    renderWithIntl(<HyroxCampaign variant="note" />);
    expect(
      screen.getByText(/オープン記念＆千葉大会応援キャンペーン/),
    ).toBeInTheDocument();
    expect(screen.getByText(/キャンペーン特別価格/)).toBeInTheDocument();
  });

  it("期間外は何も表示しない（null）", () => {
    mockActive.mockReturnValue(false);
    const { container } = renderWithIntl(<HyroxCampaign variant="banner" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("variant 未指定時は banner として表示する", () => {
    mockActive.mockReturnValue(true);
    renderWithIntl(<HyroxCampaign />);
    expect(
      screen.getByText(/オープン記念＆千葉大会応援キャンペーン/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/キャンペーン特別価格/)).not.toBeInTheDocument();
  });
});
