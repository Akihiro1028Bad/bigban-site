import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AwaitingDot, Kbd, MetaStat, RingScore, ScoreBar, Sparkline, StageChip } from "./primitives";

describe("primitives", () => {
  it("Kbd は children を描画", () => {
    render(<Kbd>esc</Kbd>);
    expect(screen.getByText("esc")).toBeInTheDocument();
  });

  it("StageChip は label を出し、generating はパルスドット", () => {
    const { rerender, container } = render(<StageChip stage="published" />);
    expect(screen.getByText("公開済み")).toBeInTheDocument();
    rerender(<StageChip stage="generating" />);
    expect(container.querySelector(".approve-pulse")).not.toBeNull();
  });

  it("StageChip small=true は小さいテキストクラスを使う", () => {
    const { container } = render(<StageChip stage="idea" small />);
    expect(container.querySelector("span")?.className).toContain("text-[11px]");
  });

  it("ScoreBar は score に応じた色トークンを style に反映", () => {
    const { container, rerender } = render(<ScoreBar score={90} />);
    expect(container.innerHTML).toContain("var(--p-green)");
    rerender(<ScoreBar score={50} />);
    expect(container.innerHTML).toContain("var(--p-text-3)");
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("AwaitingDot は説明 title を持つ", () => {
    render(<AwaitingDot />);
    expect(screen.getByTitle("あなたのアクション待ち")).toBeInTheDocument();
  });

  it("RingScore は値を表示し色トークンを反映", () => {
    const { container } = render(<RingScore value={90} />);
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(container.innerHTML).toContain("var(--p-green)");
  });

  it("Sparkline は 2点以上で path を描画、2点未満は空", () => {
    const { container, rerender } = render(<Sparkline data={[1, 2, 3]} up />);
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain("var(--p-green)");
    rerender(<Sparkline data={[1]} up={false} />);
    expect(container.querySelectorAll("path").length).toBe(0);
  });

  it("MetaStat は icon と値を並べる", () => {
    render(<MetaStat icon={<span data-testid="ic" />} title="views">1,234</MetaStat>);
    expect(screen.getByTestId("ic")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });
});
