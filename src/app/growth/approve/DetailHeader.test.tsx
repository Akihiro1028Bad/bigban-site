import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetailHeader } from "./DetailHeader";
import { detailBadge } from "./detailBadge";

describe("DetailHeader", () => {
  it("段階チップ＋種別＋タイトルを描き、閉じるで onClose を呼ぶ", async () => {
    const onClose = vi.fn();
    render(
      <DetailHeader
        title="猛暑記事"
        kindLabel="📝 記事"
        badge={detailBadge({ id: "i", kind: "idea", stage: "generating" })}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("heading", { name: "猛暑記事" })).toBeInTheDocument();
    expect(screen.getByText("生成中")).toBeInTheDocument(); // 段階チップ(ラベル併記)
    expect(screen.getByText("📝 記事")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
