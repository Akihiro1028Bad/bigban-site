import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdviceResultBody } from "./AdviceResultBody";

describe("AdviceResultBody", () => {
  it("過去データにスコアがあっても主観点数を表示しない", () => {
    render(
      <AdviceResultBody
        advice={{
          summary: "選択肢は明確ですが、同じ注意点が繰り返されています。",
          scores: [{ axis: "読みやすさ", score: 4, note: "旧データ" }],
          strengths: [],
          fixes: [],
        }}
        adopted={new Set()}
        selectable={false}
        classifications={[]}
        onToggleAdopt={vi.fn()}
        onSetAdoptedBulk={vi.fn()}
      />
    );

    expect(screen.getByText("総評")).toBeInTheDocument();
    expect(screen.queryByLabelText("観点別スコア")).not.toBeInTheDocument();
    expect(screen.queryByText("4/5")).not.toBeInTheDocument();
    expect(screen.queryByText("80")).not.toBeInTheDocument();
  });
});
