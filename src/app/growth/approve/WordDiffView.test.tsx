import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { WordDiffView } from "./WordDiffView";

describe("WordDiffView", () => {
  it("追加・削除を色＋テキスト(sr-only)で示す", () => {
    render(<WordDiffView before="赤い車" after="青い車" />);
    const region = screen.getByLabelText("元と新の差分");
    expect(within(region).getByText("（追加）")).toBeInTheDocument();
    expect(within(region).getByText("（削除）")).toBeInTheDocument();
    // 変わらない部分はそのまま表示。
    expect(within(region).getByText("い車")).toBeInTheDocument();
  });

  it("同一なら追加/削除マークを出さない", () => {
    render(<WordDiffView before="同じ" after="同じ" />);
    const region = screen.getByLabelText("元と新の差分");
    expect(within(region).queryByText("（追加）")).not.toBeInTheDocument();
    expect(within(region).queryByText("（削除）")).not.toBeInTheDocument();
  });
});
