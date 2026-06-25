import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { StyleHints } from "./StyleHints";

describe("StyleHints", () => {
  it("NG語・AI定型をカテゴリ別件数で出す", () => {
    render(<StyleHints plain="絶対に最高。今だけ急げ。" />);
    const region = screen.getByRole("region", { name: "文体チェック" });
    expect(within(region).getByText("誇大")).toBeInTheDocument();
    expect(within(region).getByText("煽り")).toBeInTheDocument();
  });

  it("用語のゆれを置換候補つきで出す(#H22)", () => {
    render(<StyleHints plain="ラケットで打つ。" />);
    const region = screen.getByRole("region", { name: "文体チェック" });
    expect(within(region).getByText("「ラケット」→", { exact: false })).toBeInTheDocument();
    expect(within(region).getByText(/パドル/)).toBeInTheDocument();
  });

  it("該当なしは『見つかりませんでした』を出す", () => {
    render(<StyleHints plain="市川の屋内コートで平日夜に打てる。" />);
    expect(screen.getByText(/見つかりませんでした/)).toBeInTheDocument();
  });
});
