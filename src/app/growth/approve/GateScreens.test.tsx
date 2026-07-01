import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  BoardEmpty,
  EmptyGate,
  ErrorState,
  LoadErrorGate,
  LoadingGate,
  ReviewDoneEmpty,
  SearchEmpty,
  SkeletonBoard,
} from "./GateScreens";

describe("GateScreens(P2 再スキン)", () => {
  it("SkeletonBoard は骨格プレースホルダ(approve-shimmer)を描画する", () => {
    const { container } = render(<SkeletonBoard />);
    expect(container.querySelector(".approve-shimmer")).toBeInTheDocument();
  });

  it("SkeletonBoard は読み込み中を明示する(aria-busy)", () => {
    render(<SkeletonBoard />);
    expect(screen.getByLabelText("読み込み中")).toHaveAttribute("aria-busy", "true");
  });

  it("BoardEmpty は空メッセージを出す", () => {
    render(<BoardEmpty />);
    expect(screen.getByText("記事がありません")).toBeInTheDocument();
  });

  it("ReviewDoneEmpty は達成メッセージを出す", () => {
    render(<ReviewDoneEmpty />);
    expect(screen.getByText(/完了/)).toBeInTheDocument();
    expect(screen.getByText(/お疲れ/)).toBeInTheDocument();
  });

  it("SearchEmpty は query を反映する", () => {
    render(<SearchEmpty query="ピックル" />);
    expect(screen.getByText(/ピックル/)).toBeInTheDocument();
  });

  it("ErrorState は再試行ボタンで onRetry を呼ぶ", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: /再試行|再読み込み/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("ErrorState は message を渡すと具体的なエラー内容を出す", () => {
    render(<ErrorState onRetry={() => {}} message="サーバー設定エラー" />);
    expect(screen.getByRole("alert")).toHaveTextContent("サーバー設定エラー");
  });
});

describe("GateScreens 後方互換ラッパー", () => {
  it("LoadingGate は SkeletonBoard を描画する", () => {
    const { container } = render(<LoadingGate />);
    expect(container.querySelector(".approve-shimmer")).toBeInTheDocument();
  });

  it("LoadErrorGate は message を alert で出し、再読み込みで onRetry を呼ぶ", async () => {
    const onRetry = vi.fn();
    render(<LoadErrorGate message="取得に失敗しました" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("取得に失敗しました");
    await userEvent.click(screen.getByRole("button", { name: /再読み込み|再試行/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("EmptyGate は達成メッセージと施策追加フォームを維持する", () => {
    render(<EmptyGate token="t1" onAdded={() => {}} />);
    expect(screen.getAllByText(/完了|お疲れ|ありません/).length).toBeGreaterThan(0);
    // #255 施策追加導線(AddProposalForm)を必ず維持する。
    expect(screen.getByLabelText("施策名")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加する" })).toBeInTheDocument();
  });
});
