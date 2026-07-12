import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConsoleHeader, StatusDot, SummaryButton } from "./consolePrimitives";

describe("consolePrimitives", () => {
  it("補助見出しとアクションを省略してヘッダーを表示する", () => {
    render(<ConsoleHeader title="設定" description="設定の説明" />);
    expect(screen.getByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(screen.getByText("設定の説明")).toBeInTheDocument();
  });

  it("サマリーボタンを操作できる", async () => {
    const onClick = vi.fn();
    render(<SummaryButton label="公開可能" value={2} hint="確認" color="#fff" icon={<span>icon</span>} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "公開可能 2件" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("指定色のステータスドットを表示する", () => {
    const { container } = render(<StatusDot color="red" />);
    expect(container.firstChild).toHaveStyle({ background: "red" });
  });
});
