import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EyecatchThumb } from "./eyecatchThumb";

describe("EyecatchThumb", () => {
  it("has && url は画像を出す(alt 反映)", () => {
    render(<EyecatchThumb hue={10} has url="https://example.com/i.png" alt="記事画像" />);
    expect(screen.getByRole("img", { name: "記事画像" })).toBeInTheDocument();
  });

  it("has && url で alt 既定は装飾画像(role img は名前なしだが要素は存在)", () => {
    const { container } = render(
      <EyecatchThumb hue={10} has url="https://example.com/i.png" />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("");
  });

  it("size 既定(40)がスタイルに反映される", () => {
    const { container } = render(
      <EyecatchThumb hue={10} has url="https://example.com/i.png" />
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("width")).toBe("40");
    expect(img?.getAttribute("height")).toBe("40");
  });

  it("size 指定を画像サイズに反映する", () => {
    const { container } = render(
      <EyecatchThumb hue={10} has url="https://example.com/i.png" size={38} />
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("width")).toBe("38");
    expect(img?.getAttribute("height")).toBe("38");
  });

  it("has 既定(true)・url 無しはグラデーション(プレースホルダにならない)", () => {
    const { container } = render(<EyecatchThumb hue={120} />);
    expect(screen.queryByText("無")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect((container.firstChild as HTMLElement).style.background).toContain(
      "linear-gradient"
    );
  });

  it("has=false はプレースホルダ(「無」)を出す", () => {
    render(<EyecatchThumb hue={10} has={false} />);
    expect(screen.getByText("無")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("has && url 無しは hue グラデーション(画像でもプレースホルダでもない)", () => {
    const { container } = render(<EyecatchThumb hue={200} has />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("無")).not.toBeInTheDocument();
    // hue がグラデーション背景に反映される(jsdom は hsl を rgb 正規化する)
    const root = container.firstChild as HTMLElement;
    expect(root.style.background).toContain("linear-gradient");
  });

  it("hue が変わると背景も変わる(hue が実際に反映されている)", () => {
    const { container: a } = render(<EyecatchThumb hue={10} has />);
    const { container: b } = render(<EyecatchThumb hue={200} has />);
    const bgA = (a.firstChild as HTMLElement).style.background;
    const bgB = (b.firstChild as HTMLElement).style.background;
    expect(bgA).not.toBe(bgB);
  });
});
