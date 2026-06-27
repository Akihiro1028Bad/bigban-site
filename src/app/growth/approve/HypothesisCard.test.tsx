import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ArticleHypothesis } from "@/lib/growth/approve";

import { HypothesisCard } from "./HypothesisCard";

function hypothesis(over: Partial<ArticleHypothesis> = {}): ArticleHypothesis {
  return {
    articleType: "獲得",
    targetReader: "本八幡近隣の初心者",
    searchIntent: "始め方を知りたい",
    winningAngle: "一次情報＋内部リンク",
    plannedCta: ["予約", "LINE"],
    successMetric: "予約クリック10件/月",
    ...over,
  };
}

describe("HypothesisCard", () => {
  it("全項目＋想定CTAチップを表示する", () => {
    render(<HypothesisCard hypothesis={hypothesis()} />);
    expect(screen.getByText("記事タイプ")).toBeInTheDocument();
    expect(screen.getByText("獲得")).toBeInTheDocument();
    expect(screen.getByText("本八幡近隣の初心者")).toBeInTheDocument();
    expect(screen.getByText("予約")).toBeInTheDocument();
    expect(screen.getByText("LINE")).toBeInTheDocument();
  });

  it("空の項目は出さない(欠落耐性)", () => {
    render(
      <HypothesisCard
        hypothesis={hypothesis({ targetReader: "", winningAngle: "", plannedCta: [] })}
      />
    );
    expect(screen.queryByText("狙う読者")).not.toBeInTheDocument();
    expect(screen.queryByText("勝ち筋")).not.toBeInTheDocument();
    expect(screen.queryByText("想定CTA")).not.toBeInTheDocument();
    // 残りの項目は出る
    expect(screen.getByText("記事タイプ")).toBeInTheDocument();
  });
});
