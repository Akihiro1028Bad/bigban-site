import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ContributorLogo from "./ContributorLogo";

import type { ContributorLogoAsset } from "@/constants/contributors";

function asset(overrides: Partial<ContributorLogoAsset> = {}): ContributorLogoAsset {
  return {
    src: "/contributors/logos/sample.png",
    alt: "サンプル",
    aspect: 2,
    ...overrides,
  };
}

describe("ContributorLogo", () => {
  it("alt を持つ画像として描画する", () => {
    render(<ContributorLogo logo={asset({ alt: "焼肉やまと" })} height={40} />);

    expect(screen.getByRole("img", { name: "焼肉やまと" })).toBeInTheDocument();
  });

  it("基準縦横比(2.5)のロゴは height をそのまま使う", () => {
    render(<ContributorLogo logo={asset({ aspect: 2.5 })} height={40} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("height", "40");
    expect(img).toHaveAttribute("width", "100");
  });

  it("正方形ロゴは面積を揃えるため高さを引き上げる", () => {
    // sqrt(2.5 / 1.0) ≈ 1.58
    render(<ContributorLogo logo={asset({ aspect: 1 })} height={40} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("height", "63");
    expect(img).toHaveAttribute("width", "63");
  });

  it("極端に横長のロゴは高さを下げて面積を揃える", () => {
    // sqrt(2.5 / 6) ≈ 0.645
    render(<ContributorLogo logo={asset({ aspect: 6 })} height={40} />);

    expect(screen.getByRole("img")).toHaveAttribute("height", "26");
  });

  it("配色や下地を加工しない(反転・合成・プレートを行わない)", () => {
    const { container } = render(<ContributorLogo logo={asset()} height={40} />);
    const img = screen.getByRole("img");

    expect(img.className).not.toContain("invert");
    expect(img).not.toHaveStyle({ mixBlendMode: "screen" });
    expect(container.querySelector("[data-plate]")).toBeNull();
  });

  it("className を外側の要素へ渡す", () => {
    const { container } = render(
      <ContributorLogo logo={asset()} height={40} className="test-class" />,
    );

    expect(container.querySelector(".test-class")).not.toBeNull();
  });
});
