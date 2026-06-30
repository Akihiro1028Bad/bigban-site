/**
 * Section(構成案1セクション)の挙動テスト(差分B Task 12)。
 *
 * コメント収集UIは相談ドロワー専用化したため、Section はコメント props の有無で
 * 描画が分岐する。ここでは「コメント無効(詳細パネル経路)」と「コメント有効だが
 * commentText 未指定でコンポーザを開いた状態」の両分岐を直接 exercise する。
 * (コメント有効＋入力ありの主要フローは ApproveClient.test.tsx の相談ドロワーで網羅。)
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { Section } from "./Section";

const baseProps = {
  heading: "見出しA",
  description: "説明A",
  editing: false,
  busy: false,
  onStartEditSection: vi.fn(),
  editor: <div>editor</div>,
  images: <div>images</div>,
};

describe("Section", () => {
  it("コメント props を渡さない(詳細パネル経路)とコメント導線を描画しない", () => {
    render(<Section {...baseProps} comments={["残コメ"]} />);
    // ＋コメント・件数バッジ・スレッドは出さず、編集導線のみ。
    expect(screen.queryByRole("button", { name: "コメントを追加: 見出しA" })).toBeNull();
    expect(screen.queryByText("コメント1")).toBeNull();
    expect(screen.queryByText("残コメ")).toBeNull();
    expect(screen.getByRole("button", { name: "セクションを編集: 見出しA" })).toBeInTheDocument();
  });

  it("コメント有効でコンポーザを開いたとき commentText 未指定なら空文字で描画する", () => {
    render(
      <Section
        {...baseProps}
        comments={[]}
        commentOpen
        onStartAddComment={vi.fn()}
        onCommentTextChange={vi.fn()}
        onCancelComment={vi.fn()}
        onSaveComment={vi.fn()}
      />
    );
    const textarea = screen.getByLabelText("コメント入力: 見出しA");
    expect(textarea).toHaveValue("");
  });
});
