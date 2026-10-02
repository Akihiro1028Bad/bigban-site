import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PbtClubReveal from "./PbtClubReveal";

describe("PbtClubReveal", () => {
  it("子要素を描画し、className を渡せる", () => {
    render(
      <PbtClubReveal className="mt-4">
        <p>内容</p>
      </PbtClubReveal>,
    );
    expect(screen.getByText("内容")).toBeInTheDocument();
    expect(screen.getByText("内容").parentElement).toHaveClass("mt-4");
  });

  it("動きを減らす設定のときは SSR の初期スタイルが残っても表示する(CSS で打ち消す)", () => {
    render(
      <PbtClubReveal>
        <p>内容</p>
      </PbtClubReveal>,
    );
    // SSR は reduced-motion を判定できず opacity:0 で描画し、クライアントとの属性不一致は
    // React が修復しない。motion-reduce で !important 相当の上書きをして見えなくなるのを防ぐ。
    const wrapper = screen.getByText("内容").parentElement;
    expect(wrapper).toHaveClass("motion-reduce:opacity-100!");
    expect(wrapper).toHaveClass("motion-reduce:transform-none!");
  });
});
